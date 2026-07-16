import { stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import type {
  ExportImageRequest,
  ExportVideoRequest,
  WatermarkLayer,
} from '../../shared/api'

const MEDIA_EXTENSIONS = new Set([
  '.avi',
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.png',
  '.tif',
  '.tiff',
  '.webm',
  '.webp',
])
const WATERMARK_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.webp'])

const assertFile = async (
  path: string,
  extensions: ReadonlySet<string>,
  label: string,
): Promise<string> => {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error(`${label}: falta la ruta del archivo.`)
  }
  const normalized = resolve(path)
  if (!extensions.has(extname(normalized).toLowerCase())) {
    throw new Error(`${label}: formato no compatible.`)
  }
  const info = await stat(normalized).catch(() => null)
  if (!info?.isFile()) throw new Error(`${label}: el archivo no existe.`)
  return normalized
}

const assertFiniteRange = (
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void => {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} debe estar entre ${minimum} y ${maximum}.`)
  }
}

export const validateLayers = async (
  layers: readonly WatermarkLayer[],
): Promise<void> => {
  if (!Array.isArray(layers)) throw new Error('Las capas no son válidas.')
  if (layers.length === 0) throw new Error('Añade al menos una marca de agua.')
  if (layers.length > 50) throw new Error('Solo se permiten hasta 50 marcas de agua.')
  const identifiers = new Set<string>()

  await Promise.all(
    layers.map(async (layer, index) => {
      if (!layer || typeof layer !== 'object') {
        throw new Error(`La marca ${index + 1} no es válida.`)
      }
      if (
        typeof layer.id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(layer.id) ||
        identifiers.has(layer.id)
      ) {
        throw new Error(`El identificador de la marca ${index + 1} no es válido.`)
      }
      identifiers.add(layer.id)
      await assertFile(layer.sourcePath, WATERMARK_EXTENSIONS, `Marca ${index + 1}`)
      assertFiniteRange(layer.width, 1, 32_768, `Ancho de la marca ${index + 1}`)
      assertFiniteRange(layer.height, 1, 32_768, `Alto de la marca ${index + 1}`)
      assertFiniteRange(layer.opacity, 0, 1, `Opacidad de la marca ${index + 1}`)
      assertFiniteRange(layer.rotation, -360_000, 360_000, `Rotación de la marca ${index + 1}`)
      assertFiniteRange(layer.x, -131_072, 131_072, `Posición X de la marca ${index + 1}`)
      assertFiniteRange(layer.y, -131_072, 131_072, `Posición Y de la marca ${index + 1}`)
      if (!Number.isSafeInteger(layer.order) || layer.order < 0 || layer.order >= 50) {
        throw new Error(`El orden de la marca ${index + 1} no es válido.`)
      }
      if (
        layer.startTime !== undefined &&
        (!Number.isFinite(layer.startTime) ||
          layer.startTime < 0 ||
          layer.startTime > 604_800)
      ) {
        throw new Error(`El inicio de la marca ${index + 1} no es válido.`)
      }
      if (
        layer.endTime !== undefined &&
        (!Number.isFinite(layer.endTime) ||
          layer.endTime < 0 ||
          layer.endTime > 604_800)
      ) {
        throw new Error(`El fin de la marca ${index + 1} no es válido.`)
      }
      if (
        layer.startTime !== undefined &&
        layer.endTime !== undefined &&
        layer.endTime < layer.startTime
      ) {
        throw new Error(`La ventana temporal de la marca ${index + 1} no es válida.`)
      }
    }),
  )
}

export const validateExportRequest = async (
  request: ExportImageRequest | ExportVideoRequest,
): Promise<void> => {
  if (!request || typeof request !== 'object') throw new Error('Solicitud no válida.')
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(request.jobId)) {
    throw new Error('El identificador de exportación no es válido.')
  }
  const source = await assertFile(request.sourcePath, MEDIA_EXTENSIONS, 'Origen')
  if (typeof request.destinationPath !== 'string' || !request.destinationPath.trim()) {
    throw new Error('Falta el archivo de destino.')
  }
  const destination = resolve(request.destinationPath)
  if (source === destination) {
    throw new Error('El destino no puede sobrescribir el archivo de origen.')
  }
  await validateLayers(request.layers)
  if (
    request.layers.some((layer) => resolve(layer.sourcePath) === destination)
  ) {
    throw new Error('El destino no puede sobrescribir una marca de agua.')
  }
}

export const supportedMediaExtensions = [...MEDIA_EXTENSIONS]
export const supportedWatermarkExtensions = [...WATERMARK_EXTENSIONS]
