import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'
import { app } from 'electron'
import type {
  AppliedPresetLayer,
  PresetLayerInput,
  PresetSummary,
  SavePresetRequest,
} from '../../shared/api'

interface StoredLayer extends Omit<PresetLayerInput, 'sourcePath'> {
  asset: string
}

interface StoredPreset extends PresetSummary {
  mediaWidth: number
  mediaHeight: number
  mediaDuration: number
  layers: StoredLayer[]
}

const MAX_PRESETS = 100
const MAX_LAYERS = 50
const MAX_ASSET_BYTES = 25 * 1024 * 1024
const ID_PATTERN = /^[a-f0-9-]{36}$/
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

const rootPath = (): string => join(app.getPath('userData'), 'presets')
const indexPath = (): string => join(rootPath(), 'index.json')
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

const safeName = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('El nombre del preset no es válido.')
  const name = value.trim().replace(/\s+/g, ' ')
  if (
    name.length < 1 ||
    name.length > 80 ||
    [...name].some((character) => character.codePointAt(0)! < 32)
  ) {
    throw new Error('El nombre del preset debe tener entre 1 y 80 caracteres.')
  }
  return name
}

const safeId = (value: unknown): string => {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new Error('El identificador del preset no es válido.')
  }
  return value
}

const readPresets = async (): Promise<StoredPreset[]> => {
  await mkdir(rootPath(), { recursive: true })
  const raw = await readFile(indexPath(), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '[]'
    throw error
  })
  if (raw.length > 2_000_000) throw new Error('El índice de presets es demasiado grande.')
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('El índice de presets está dañado.')
  return parsed as StoredPreset[]
}

const writePresets = async (presets: StoredPreset[]): Promise<void> => {
  const temporary = `${indexPath()}.tmp`
  await writeFile(temporary, JSON.stringify(presets, null, 2), 'utf8')
  await rename(temporary, indexPath())
}

const validateLayer = async (layer: PresetLayerInput, index: number): Promise<void> => {
  if (!layer || typeof layer !== 'object') throw new Error(`La capa ${index + 1} no es válida.`)
  if (typeof layer.sourcePath !== 'string') throw new Error(`Falta la imagen de la capa ${index + 1}.`)
  const extension = extname(layer.sourcePath).toLowerCase()
  if (!IMAGE_EXTENSIONS.has(extension)) throw new Error(`La imagen de la capa ${index + 1} no es compatible.`)
  const file = await stat(layer.sourcePath).catch(() => null)
  if (!file?.isFile() || file.size > MAX_ASSET_BYTES) {
    throw new Error(`La imagen de la capa ${index + 1} no existe o supera 25 MB.`)
  }
  if (typeof layer.name !== 'string' || layer.name.length > 200) throw new Error(`El nombre de la capa ${index + 1} no es válido.`)
  const checks: Array<[unknown, number, number]> = [
    [layer.naturalWidth, 1, 32_768], [layer.naturalHeight, 1, 32_768],
    [layer.x, -131_072, 131_072], [layer.y, -131_072, 131_072],
    [layer.width, 1, 32_768], [layer.height, 1, 32_768],
    [layer.rotation, -360_000, 360_000], [layer.opacity, 0, 1],
    [layer.startTime, 0, 604_800], [layer.endTime, 0, 604_800],
  ]
  if (checks.some(([value, min, max]) => !finite(value, min, max)) || layer.endTime < layer.startTime || typeof layer.visible !== 'boolean') {
    throw new Error(`Los datos de la capa ${index + 1} no son válidos.`)
  }
}

export const listPresets = async (): Promise<PresetSummary[]> =>
  (await readPresets()).map(({ id, name, layerCount, createdAt }) => ({
    id, name, layerCount, createdAt,
  }))

export const savePreset = async (request: SavePresetRequest): Promise<PresetSummary> => {
  if (!request || typeof request !== 'object') throw new Error('Los datos del preset no son válidos.')
  const name = safeName(request.name)
  if (!finite(request.mediaWidth, 1, 32_768) || !finite(request.mediaHeight, 1, 32_768) || !finite(request.mediaDuration, 0, 604_800)) {
    throw new Error('Las dimensiones del medio no son válidas.')
  }
  if (!Array.isArray(request.layers) || request.layers.length < 1 || request.layers.length > MAX_LAYERS) {
    throw new Error(`Un preset debe contener entre 1 y ${MAX_LAYERS} capas.`)
  }
  await Promise.all(request.layers.map((layer, index) => validateLayer(layer, index)))
  const presets = await readPresets()
  if (presets.length >= MAX_PRESETS) throw new Error(`Solo se permiten ${MAX_PRESETS} presets.`)

  const id = randomUUID()
  const directory = join(rootPath(), id)
  await mkdir(directory, { recursive: true })
  try {
    const layers: StoredLayer[] = []
    for (const [index, layer] of request.layers.entries()) {
      const asset = `${index}${extname(layer.sourcePath).toLowerCase()}`
      await copyFile(layer.sourcePath, join(directory, asset))
      layers.push({
        asset,
        name: layer.name,
        naturalWidth: layer.naturalWidth,
        naturalHeight: layer.naturalHeight,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation,
        opacity: layer.opacity,
        startTime: layer.startTime,
        endTime: layer.endTime,
        visible: layer.visible,
      })
    }
    const preset: StoredPreset = {
      id,
      name,
      layerCount: layers.length,
      createdAt: new Date().toISOString(),
      mediaWidth: request.mediaWidth,
      mediaHeight: request.mediaHeight,
      mediaDuration: request.mediaDuration,
      layers,
    }
    await writePresets([...presets, preset])
    return { id, name, layerCount: layers.length, createdAt: preset.createdAt }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export const applyPreset = async (
  presetId: unknown,
  mediaWidth: unknown,
  mediaHeight: unknown,
  mediaDuration: unknown,
): Promise<{ id: string; name: string; layers: AppliedPresetLayer[] }> => {
  const id = safeId(presetId)
  if (!finite(mediaWidth, 1, 32_768) || !finite(mediaHeight, 1, 32_768) || !finite(mediaDuration, 0, 604_800)) {
    throw new Error('El medio de destino no es válido.')
  }
  const preset = (await readPresets()).find((item) => item.id === id)
  if (!preset) throw new Error('El preset ya no existe.')
  if (
    !finite(preset.mediaWidth, 1, 32_768) ||
    !finite(preset.mediaHeight, 1, 32_768) ||
    !finite(preset.mediaDuration, 0, 604_800) ||
    !Array.isArray(preset.layers) ||
    preset.layers.length < 1 ||
    preset.layers.length > MAX_LAYERS
  ) {
    throw new Error('Los datos guardados del preset están dañados.')
  }
  const scaleX = mediaWidth / preset.mediaWidth
  const scaleY = mediaHeight / preset.mediaHeight
  const timeScale = preset.mediaDuration > 0 ? mediaDuration / preset.mediaDuration : 1
  const directory = resolve(rootPath(), id)
  const layers = await Promise.all(preset.layers.map(async (layer, index) => {
    if (
      typeof layer.asset !== 'string' ||
      basename(layer.asset) !== layer.asset ||
      !IMAGE_EXTENSIONS.has(extname(layer.asset).toLowerCase())
    ) {
      throw new Error('El preset contiene un recurso no seguro.')
    }
    const sourcePath = resolve(directory, basename(layer.asset))
    if (!sourcePath.startsWith(`${directory}${sep}`)) throw new Error('El preset contiene una ruta no segura.')
    const file = await stat(sourcePath).catch(() => null)
    if (!file?.isFile() || file.size > MAX_ASSET_BYTES) {
      throw new Error('Falta una imagen interna del preset.')
    }
    await validateLayer({ ...layer, sourcePath }, index)
    return {
      ...layer,
      id: randomUUID(),
      sourcePath,
      previewUrl: '',
      x: layer.x * scaleX,
      y: layer.y * scaleY,
      width: layer.width * scaleX,
      height: layer.height * scaleY,
      startTime: Math.min(mediaDuration, layer.startTime * timeScale),
      endTime: Math.min(mediaDuration, layer.endTime * timeScale),
    }
  }))
  return { id, name: preset.name, layers }
}

export const deletePreset = async (presetId: unknown): Promise<boolean> => {
  const id = safeId(presetId)
  const presets = await readPresets()
  if (!presets.some((item) => item.id === id)) return false
  await writePresets(presets.filter((item) => item.id !== id))
  await rm(join(rootPath(), id), { recursive: true, force: true })
  return true
}
