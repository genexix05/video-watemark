import type { MediaKind, WatermarkLayer } from '../../shared/api'

export interface FilterGraph {
  graph: string
  outputLabel: string
  orderedLayers: WatermarkLayer[]
}

const number = (value: number): string => {
  if (!Number.isFinite(value)) throw new Error('El filtro contiene un valor no válido.')
  return Number(value.toFixed(6)).toString()
}

const temporalEnable = (layer: WatermarkLayer, kind: MediaKind): string => {
  if (kind !== 'video') return ''
  const start = Math.max(0, layer.startTime ?? 0)
  const end = layer.endTime
  if (end === undefined) return start > 0 ? `:enable='gte(t\\,${number(start)})'` : ''
  return `:enable='between(t\\,${number(start)}\\,${number(Math.max(start, end))})'`
}

export const buildFilterGraph = (
  layers: readonly WatermarkLayer[],
  kind: MediaKind,
  outputWidth: number,
  outputHeight: number,
): FilterGraph => {
  const orderedLayers = [...layers].sort(
    (left, right) => left.order - right.order,
  )
  const filters: string[] = [
    `[0:v]scale=${Math.round(outputWidth)}:${Math.round(outputHeight)}:flags=lanczos,setsar=1[base]`,
  ]
  let current = 'base'

  orderedLayers.forEach((layer, index) => {
    const watermark = `wm${index}`
    const composited = `composite${index}`
    const radians = `${number(layer.rotation)}*PI/180`
    const scaledWidth = Math.max(1, Math.ceil(layer.width))
    const scaledHeight = Math.max(1, Math.ceil(layer.height))
    filters.push(
      `[${index + 1}:v]format=rgba,pad=iw+32:ih+32:16:16:color=0x00000000,scale=ceil(${scaledWidth}*iw/(iw-32)):ceil(${scaledHeight}*ih/(ih-32)):flags=lanczos,rotate=${radians}:ow=ceil(rotw(${radians}))+2:oh=ceil(roth(${radians}))+2:c=none,colorchannelmixer=aa=${number(layer.opacity)}[${watermark}]`,
    )
    filters.push(
      `[${current}][${watermark}]overlay=x=${number(layer.x)}+(${number(layer.width)}-overlay_w)/2:y=${number(layer.y)}+(${number(layer.height)}-overlay_h)/2:eof_action=repeat${temporalEnable(layer, kind)}[${composited}]`,
    )
    current = composited
  })

  filters.push(`[${current}]null[vout]`)
  return {
    graph: filters.join(';'),
    outputLabel: 'vout',
    orderedLayers,
  }
}
