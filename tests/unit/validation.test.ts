import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExportImageRequest, WatermarkLayer } from '../../src/shared/api'
import {
  validateExportRequest,
  validateLayers,
} from '../../src/main/media/validation'

let directory: string
let sourcePath: string
let watermarkPath: string

const validLayer = (overrides: Partial<WatermarkLayer> = {}): WatermarkLayer => ({
  id: 'mark-1',
  sourcePath: watermarkPath,
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  rotation: 0,
  opacity: 1,
  order: 0,
  startTime: 0,
  endTime: 2,
  ...overrides,
})

const validRequest = (
  overrides: Partial<ExportImageRequest> = {},
): ExportImageRequest => ({
  jobId: 'job-1',
  sourcePath,
  destinationPath: join(directory, 'output.png'),
  layers: [validLayer()],
  format: 'png',
  ...overrides,
})

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'watermark-validation-'))
  sourcePath = join(directory, 'source.png')
  watermarkPath = join(directory, 'watermark.png')
  await Promise.all([
    writeFile(sourcePath, 'source'),
    writeFile(watermarkPath, 'watermark'),
  ])
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('validación multimedia', () => {
  it('acepta una solicitud local válida', async () => {
    await expect(validateExportRequest(validRequest())).resolves.toBeUndefined()
  })

  it('rechaza capas vacías, identificadores duplicados y rangos inválidos', async () => {
    await expect(validateLayers([])).rejects.toThrow('al menos una')
    await expect(
      validateLayers([validLayer(), validLayer({ order: 1 })]),
    ).rejects.toThrow('identificador')
    await expect(validateLayers([validLayer({ opacity: 1.1 })])).rejects.toThrow(
      'Opacidad',
    )
    await expect(
      validateLayers([validLayer({ startTime: 3, endTime: 2 })]),
    ).rejects.toThrow('ventana temporal')
  })

  it('rechaza formatos, archivos ausentes y rutas de destino peligrosas', async () => {
    await expect(
      validateExportRequest(validRequest({ sourcePath: join(directory, 'missing.png') })),
    ).rejects.toThrow('no existe')
    await expect(
      validateExportRequest(validRequest({ sourcePath: join(directory, 'source.exe') })),
    ).rejects.toThrow('formato no compatible')
    await expect(
      validateExportRequest(validRequest({ destinationPath: sourcePath })),
    ).rejects.toThrow('sobrescribir el archivo de origen')
    await expect(
      validateExportRequest(validRequest({ destinationPath: watermarkPath })),
    ).rejects.toThrow('sobrescribir una marca')
  })
})
