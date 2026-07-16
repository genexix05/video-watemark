import { extname, resolve } from 'node:path'
import type { MediaKind, MediaMetadata } from '../../shared/api'
import { getMediaBinaryPaths } from '../media-binaries'
import { runProcess } from './process'

interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  duration?: string
  avg_frame_rate?: string
  r_frame_rate?: string
  tags?: { rotate?: string }
  side_data_list?: Array<{ rotation?: number }>
}

interface ProbeOutput {
  streams?: ProbeStream[]
  format?: { duration?: string }
}

const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
])

const parseFinite = (value: string | number | undefined): number | null => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : null
}

const parseRate = (rate: string | undefined): number | null => {
  if (!rate) return null
  const [numerator, denominator = '1'] = rate.split('/')
  const divisor = Number(denominator)
  const result = Number(numerator) / divisor
  return Number.isFinite(result) && result > 0 ? result : null
}

const normalizeRotation = (stream: ProbeStream): number => {
  const raw =
    stream.side_data_list?.find((sideData) => sideData.rotation !== undefined)
      ?.rotation ?? parseFinite(stream.tags?.rotate) ?? 0
  return ((Math.round(raw) % 360) + 360) % 360
}

export const probeMedia = async (inputPath: string): Promise<MediaMetadata> => {
  const path = resolve(inputPath)
  const { ffprobe } = getMediaBinaryPaths()
  const { stdout } = await runProcess(ffprobe, [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    path,
  ])

  let output: ProbeOutput
  try {
    output = JSON.parse(stdout) as ProbeOutput
  } catch {
    throw new Error('FFprobe devolvió metadatos no válidos.')
  }

  const video = output.streams?.find((stream) => stream.codec_type === 'video')
  if (!video?.width || !video.height) {
    throw new Error('El archivo no contiene una imagen o pista de vídeo compatible.')
  }

  const audio = output.streams?.find((stream) => stream.codec_type === 'audio')
  const formatDuration = parseFinite(output.format?.duration)
  const streamDuration = parseFinite(video.duration)
  const duration = formatDuration ?? streamDuration
  const extensionLooksLikeImage = IMAGE_EXTENSIONS.has(extname(path).toLowerCase())
  const kind: MediaKind =
    extensionLooksLikeImage || duration === null || duration <= 0 ? 'image' : 'video'
  const rotation = normalizeRotation(video)
  const swapsDimensions = rotation === 90 || rotation === 270

  return {
    path,
    kind,
    width: swapsDimensions ? video.height : video.width,
    height: swapsDimensions ? video.width : video.height,
    duration: kind === 'video' ? duration : null,
    fps:
      kind === 'video'
        ? parseRate(video.avg_frame_rate) ?? parseRate(video.r_frame_rate)
        : null,
    videoCodec: video.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    hasAudio: audio !== undefined,
    rotation,
  }
}
