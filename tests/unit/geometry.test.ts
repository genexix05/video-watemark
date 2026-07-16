import { describe, expect, it } from 'vitest'
import {
  clamp,
  clientToMediaPoint,
  proportionalSize,
} from '../../src/renderer/geometry'

describe('geometría del editor', () => {
  it('convierte coordenadas CSS a coordenadas del medio con escala y desplazamiento', () => {
    expect(
      clientToMediaPoint(
        { x: 350, y: 225 },
        { left: 100, top: 100, width: 500, height: 250 },
        1920,
        1080,
      ),
    ).toEqual({ x: 960, y: 540 })
  })

  it('mantiene la proporción al redimensionar en ambos ejes', () => {
    expect(proportionalSize(200, 400, 200, 50, 10, 24, 1000)).toEqual({
      width: 250,
      height: 125,
    })
    expect(proportionalSize(200, 400, 200, 10, 50, 24, 1000)).toEqual({
      width: 300,
      height: 150,
    })
  })

  it('respeta los límites de tamaño y posición', () => {
    expect(proportionalSize(30, 16, 9, -100, 0, 24, 1000)).toEqual({
      width: 24,
      height: 13.5,
    })
    expect(clamp(-20, -10, 100)).toBe(-10)
    expect(clamp(120, -10, 100)).toBe(100)
  })
})
