import { describe, expect, it } from 'vitest'
import type { WatermarkLayer } from '../../src/shared/api'
import { buildFilterGraph } from '../../src/main/media/build-filter'

const layer = (overrides: Partial<WatermarkLayer> = {}): WatermarkLayer => ({
  id: 'layer',
  sourcePath: '/tmp/mark.png',
  x: 12.25,
  y: -4,
  width: 320,
  height: 180,
  rotation: 45,
  opacity: 0.75,
  order: 0,
  ...overrides,
})

describe('grafo de filtros FFmpeg', () => {
  it('ordena capas y encadena cada composición', () => {
    const result = buildFilterGraph(
      [layer({ id: 'top', order: 2 }), layer({ id: 'bottom', order: 0 })],
      'image',
      1920,
      1080,
    )

    expect(result.orderedLayers.map(({ id }) => id)).toEqual(['bottom', 'top'])
    expect(result.graph).toContain('[0:v]scale=1920:1080:flags=lanczos,setsar=1[base]')
    expect(result.graph).toContain('[base][wm0]overlay=')
    expect(result.graph).toContain('[composite0][wm1]overlay=')
    expect(result.graph).toMatch(/\[composite1\]null\[vout\]$/)
  })

  it('genera escala, rotación, opacidad y coordenadas centradas seguras', () => {
    const { graph } = buildFilterGraph([layer()], 'image', 800, 600)

    expect(graph).toContain(
      'pad=iw+32:ih+32:16:16:color=0x00000000,scale=ceil(320*iw/(iw-32)):ceil(180*ih/(ih-32)):flags=lanczos,rotate=45*PI/180:ow=ceil(rotw(45*PI/180))+2:oh=ceil(roth(45*PI/180))+2:c=none,colorchannelmixer=aa=0.75[wm0]',
    )
    expect(graph).toContain(
      'overlay=x=12.25+(320-overlay_w)/2:y=-4+(180-overlay_h)/2:eof_action=repeat',
    )
    expect(graph).not.toContain('enable=')
  })

  it('redondea tamaños pequeños hacia arriba y añade margen transparente', () => {
    const { graph } = buildFilterGraph(
      [layer({ width: 19.2, height: 2.1, rotation: 0 })],
      'image',
      800,
      600,
    )
    expect(graph).toContain(
      'pad=iw+32:ih+32:16:16:color=0x00000000,scale=ceil(20*iw/(iw-32)):ceil(3*ih/(ih-32)):flags=lanczos',
    )
    expect(graph).toContain('ow=ceil(rotw(0*PI/180))+2:oh=ceil(roth(0*PI/180))+2')
  })

  it('limita temporalmente las marcas de vídeo y escapa las comas', () => {
    const ranged = buildFilterGraph(
      [layer({ startTime: 1.25, endTime: 3.5 })],
      'video',
      640,
      360,
    )
    const openEnded = buildFilterGraph(
      [layer({ startTime: 2, endTime: undefined })],
      'video',
      640,
      360,
    )

    expect(ranged.graph).toContain("enable='between(t\\,1.25\\,3.5)'")
    expect(openEnded.graph).toContain("enable='gte(t\\,2)'")
  })

  it('rechaza valores no finitos antes de construir el comando', () => {
    expect(() =>
      buildFilterGraph([layer({ x: Number.NaN })], 'image', 640, 360),
    ).toThrow('valor no válido')
  })
})
