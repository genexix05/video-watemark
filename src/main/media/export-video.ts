import { spawn } from 'node:child_process'
import { extname } from 'node:path'
import type {
  ExportProgress,
  ExportResult,
  ExportVideoRequest,
  MediaMetadata,
  VideoQualityProfile,
} from '../../shared/api'
import { getMediaBinaryPaths } from '../media-binaries'
import { buildFilterGraph } from './build-filter'
import { MediaProcessError } from './process'
import { probeMedia } from './probe'
import { validateExportRequest } from './validation'

type ProgressListener = (progress: ExportProgress) => void

const videoCodecArgs = (
  extension: string,
  profile: VideoQualityProfile,
): string[] => {
  if (extension === '.webm') {
    if (profile === 'lossless') {
      return ['-c:v', 'libvpx-vp9', '-lossless', '1', '-row-mt', '1']
    }
    return [
      '-c:v',
      'libvpx-vp9',
      '-crf',
      profile === 'high' ? '20' : '34',
      '-b:v',
      '0',
      '-row-mt',
      '1',
    ]
  }
  if (profile === 'lossless') {
    return ['-c:v', 'libx264', '-qp', '0', '-preset', 'medium']
  }
  return [
    '-c:v',
    'libx264',
    '-crf',
    profile === 'high' ? '18' : '28',
    '-preset',
    profile === 'high' ? 'medium' : 'slow',
  ]
}

const canCopyAudio = (extension: string, codec: string | null): boolean => {
  if (!codec) return false
  if (extension === '.mkv') return true
  if (extension === '.webm') return codec === 'opus' || codec === 'vorbis'
  return ['aac', 'ac3', 'alac', 'eac3', 'mp3'].includes(codec)
}

const audioCodecArgs = (extension: string, metadata: MediaMetadata): string[] => {
  if (!metadata.hasAudio) return []
  if (canCopyAudio(extension, metadata.audioCodec)) return ['-c:a', 'copy']
  return extension === '.webm'
    ? ['-c:a', 'libopus', '-b:a', '160k']
    : ['-c:a', 'aac', '-b:a', '192k']
}

const supportedOutput = new Set(['.mkv', '.mov', '.mp4', '.webm'])

export const exportVideo = async (
  request: ExportVideoRequest,
  onProgress: ProgressListener,
  signal?: AbortSignal,
): Promise<ExportResult> => {
  await validateExportRequest(request)
  const metadata = await probeMedia(request.sourcePath)
  if (metadata.kind !== 'video' || metadata.duration === null) {
    throw new Error('El archivo de origen no es un vídeo.')
  }
  const duration = metadata.duration
  if (!['high', 'lossless', 'compact'].includes(request.profile)) {
    throw new Error('El perfil de calidad no es válido.')
  }
  if (
    request.layers.some(
      (layer) =>
        (layer.startTime ?? 0) > duration ||
        (layer.endTime ?? duration) > duration,
    )
  ) {
    throw new Error('El intervalo de una marca excede la duración del vídeo.')
  }
  const extension = extname(request.destinationPath).toLowerCase()
  if (!supportedOutput.has(extension)) {
    throw new Error('El formato de vídeo de destino no es compatible.')
  }

  const filter = buildFilterGraph(
    request.layers,
    'video',
    metadata.width,
    metadata.height,
  )
  const args = ['-hide_banner', '-y', '-i', request.sourcePath]
  for (const layer of filter.orderedLayers) {
    args.push(
      '-loop',
      '1',
      '-framerate',
      String(metadata.fps ?? 30),
      '-i',
      layer.sourcePath,
    )
  }
  const pixelFormat =
    metadata.width % 2 === 0 && metadata.height % 2 === 0 ? 'yuv420p' : 'yuv444p'
  args.push(
    '-filter_complex',
    filter.graph,
    '-map',
    `[${filter.outputLabel}]`,
    '-map',
    '0:a?',
    ...videoCodecArgs(extension, request.profile),
    ...audioCodecArgs(extension, metadata),
    '-pix_fmt',
    pixelFormat,
    '-fps_mode',
    'passthrough',
    '-metadata:s:v:0',
    'rotate=0',
    '-t',
    String(metadata.duration),
    '-progress',
    'pipe:1',
    '-nostats',
    request.destinationPath,
  )

  onProgress({
    jobId: request.jobId,
    progress: 0,
    processedSeconds: 0,
    totalSeconds: metadata.duration,
    status: 'running',
  })
  await runFfmpegWithProgress(args, request.jobId, metadata.duration, onProgress, signal)
  return {
    jobId: request.jobId,
    destinationPath: request.destinationPath,
    cancelled: false,
  }
}

const runFfmpegWithProgress = (
  args: readonly string[],
  jobId: string,
  duration: number,
  onProgress: ProgressListener,
  signal?: AbortSignal,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(getMediaBinaryPaths().ffmpeg, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    })
    let pending = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.stdout.on('data', (chunk: string) => {
      pending += chunk
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() ?? ''
      for (const line of lines) {
        const [key, value] = line.split('=', 2)
        if (key !== 'out_time_us') continue
        const processedSeconds = Math.max(0, Number(value) / 1_000_000)
        onProgress({
          jobId,
          progress: Math.min(1, processedSeconds / duration),
          processedSeconds,
          totalSeconds: duration,
          status: 'running',
        })
      }
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve()
      else {
        reject(
          new MediaProcessError(
            `FFmpeg terminó con código ${code ?? 'desconocido'}.`,
            stderr,
            code,
          ),
        )
      }
    })
  })
