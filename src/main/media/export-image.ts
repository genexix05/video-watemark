import { extname } from 'node:path'
import type { ExportImageRequest, ExportResult } from '../../shared/api'
import { getMediaBinaryPaths } from '../media-binaries'
import { buildFilterGraph } from './build-filter'
import { probeMedia } from './probe'
import { runProcess } from './process'
import { validateExportRequest } from './validation'

const imageCodecArgs = (format: ExportImageRequest['format'], quality = 90): string[] => {
  const normalizedQuality = Math.min(100, Math.max(1, Math.round(quality)))
  switch (format) {
    case 'png':
      return ['-c:v', 'png', '-compression_level', '6', '-f', 'image2']
    case 'jpeg': {
      const quantizer = Math.round(31 - (normalizedQuality / 100) * 29)
      return ['-c:v', 'mjpeg', '-q:v', String(quantizer), '-f', 'image2']
    }
    case 'webp':
      return ['-c:v', 'libwebp', '-quality', String(normalizedQuality), '-f', 'image2']
  }
}

export const exportImage = async (
  request: ExportImageRequest,
  signal?: AbortSignal,
): Promise<ExportResult> => {
  await validateExportRequest(request)
  if (!['png', 'jpeg', 'webp'].includes(request.format)) {
    throw new Error('El formato de imagen de destino no es compatible.')
  }
  if (
    request.quality !== undefined &&
    (!Number.isFinite(request.quality) ||
      request.quality < 1 ||
      request.quality > 100)
  ) {
    throw new Error('La calidad de imagen debe estar entre 1 y 100.')
  }
  const extension = extname(request.destinationPath).toLowerCase()
  const validExtension =
    request.format === 'jpeg'
      ? extension === '.jpg' || extension === '.jpeg'
      : extension === `.${request.format}`
  if (!validExtension) {
    throw new Error('La extensión del destino no coincide con el formato de imagen.')
  }
  const metadata = await probeMedia(request.sourcePath)
  if (metadata.kind !== 'image') throw new Error('El archivo de origen no es una imagen.')

  const filter = buildFilterGraph(
    request.layers,
    'image',
    metadata.width,
    metadata.height,
  )
  const args = ['-hide_banner', '-y', '-i', request.sourcePath]
  for (const layer of filter.orderedLayers) args.push('-i', layer.sourcePath)
  args.push(
    '-filter_complex',
    filter.graph,
    '-map',
    `[${filter.outputLabel}]`,
    '-frames:v',
    '1',
    ...imageCodecArgs(request.format, request.quality),
    request.destinationPath,
  )

  await runProcess(getMediaBinaryPaths().ffmpeg, args, signal)
  return {
    jobId: request.jobId,
    destinationPath: request.destinationPath,
    cancelled: false,
  }
}
