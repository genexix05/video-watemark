import { access, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type {
  ExportImageRequest,
  ExportProgress,
  ExportVideoRequest,
  WatermarkLayer,
} from '../../src/shared/api'

const binaries = {
  ffmpeg: join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
  ffprobe: join(
    process.cwd(),
    'node_modules',
    'ffprobe-static',
    'bin',
    process.platform,
    process.arch,
    process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
  ),
}

vi.mock('../../src/main/media-binaries', () => ({
  getMediaBinaryPaths: () => binaries,
}))

import { ExportManager } from '../../src/main/media/export-manager'
import { exportImage } from '../../src/main/media/export-image'
import { exportVideo } from '../../src/main/media/export-video'
import { probeMedia } from '../../src/main/media/probe'
import { runProcess } from '../../src/main/media/process'

let directory: string
let imageSource: string
let videoSource: string
let rotatedVideoSource: string
let firstMark: string
let secondMark: string

const ffmpeg = (...args: string[]) =>
  runProcess(binaries.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args])

const layers = (): WatermarkLayer[] => [
  {
    id: 'red-mark',
    sourcePath: firstMark,
    x: 20,
    y: 15,
    width: 80,
    height: 40,
    rotation: 12,
    opacity: 0.8,
    order: 0,
    startTime: 0,
    endTime: 1.6,
  },
  {
    id: 'blue-mark',
    sourcePath: secondMark,
    x: 190,
    y: 105,
    width: 60,
    height: 60,
    rotation: -20,
    opacity: 0.65,
    order: 1,
    startTime: 0.4,
    endTime: 2,
  },
]

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'watermark-pipeline-'))
  imageSource = join(directory, 'source.png')
  videoSource = join(directory, 'source.mp4')
  rotatedVideoSource = join(directory, 'source-rotated.mov')
  firstMark = join(directory, 'mark-red.png')
  secondMark = join(directory, 'mark-blue.png')

  await ffmpeg('-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=1', '-frames:v', '1', imageSource)
  await ffmpeg('-f', 'lavfi', '-i', 'color=c=red@0.8:s=120x60', '-frames:v', '1', firstMark)
  await ffmpeg('-f', 'lavfi', '-i', 'color=c=blue@0.7:s=80x80', '-frames:v', '1', secondMark)
  await ffmpeg(
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=24:duration=2',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=880:sample_rate=48000:duration=2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    videoSource,
  )
  await ffmpeg(
    '-i',
    videoSource,
    '-c',
    'copy',
    '-metadata:s:v:0',
    'rotate=90',
    rotatedVideoSource,
  )
}, 60_000)

afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('pipeline multimedia local', () => {
  it.each([
    ['png', undefined, 'png'],
    ['jpeg', 82, 'jpg'],
    ['webp', 78, 'webp'],
  ] as const)('exporta una foto %s con varias marcas', async (format, quality, extension) => {
    const destinationPath = join(directory, `image-output.${extension}`)
    const request: ExportImageRequest = {
      jobId: `image-${format}`,
      sourcePath: imageSource,
      destinationPath,
      layers: layers(),
      format,
      quality,
    }

    await expect(exportImage(request)).resolves.toMatchObject({ cancelled: false })
    const metadata = await probeMedia(destinationPath)
    expect(metadata).toMatchObject({ kind: 'image', width: 320, height: 180 })
    await expect(access(destinationPath)).resolves.toBeUndefined()
  }, 30_000)

  it.each(['high', 'lossless', 'compact'] as const)(
    'exporta vídeo con perfil %s conservando propiedades esenciales',
    async (profile) => {
      const destinationPath = join(directory, `video-${profile}.mp4`)
      const progress: ExportProgress[] = []
      const request: ExportVideoRequest = {
        jobId: `video-${profile}`,
        sourcePath: videoSource,
        destinationPath,
        layers: layers(),
        profile,
      }

      await expect(
        exportVideo(request, (event) => progress.push(event)),
      ).resolves.toMatchObject({ cancelled: false })
      const metadata = await probeMedia(destinationPath)
      expect(metadata.kind).toBe('video')
      expect(metadata.width).toBe(320)
      expect(metadata.height).toBe(180)
      expect(metadata.fps).toBeCloseTo(24, 2)
      expect(metadata.duration).toBeCloseTo(2, 1)
      expect(metadata.hasAudio).toBe(true)
      expect(metadata.audioCodec).toBe('aac')
      expect(progress[0]).toMatchObject({ progress: 0, status: 'running' })
      expect(progress.some(({ progress: value }) => value > 0)).toBe(true)
    },
    60_000,
  )

  it('normaliza la orientación de vídeo y sus dimensiones visibles', async () => {
    const sourceMetadata = await probeMedia(rotatedVideoSource)
    expect(sourceMetadata).toMatchObject({
      kind: 'video',
      width: 180,
      height: 320,
      rotation: 90,
    })
    const destinationPath = join(directory, 'rotated-output.mp4')
    const rotatedLayers = layers().map((layer) => ({
      ...layer,
      x: Math.min(layer.x, 100),
      y: Math.min(layer.y, 200),
      width: Math.min(layer.width, 60),
      height: Math.min(layer.height, 40),
    }))
    await exportVideo(
      {
        jobId: 'rotated-video',
        sourcePath: rotatedVideoSource,
        destinationPath,
        layers: rotatedLayers,
        profile: 'high',
      },
      () => undefined,
    )
    const outputMetadata = await probeMedia(destinationPath)
    expect(outputMetadata).toMatchObject({
      width: 180,
      height: 320,
      rotation: 0,
      hasAudio: true,
    })
  }, 60_000)

  it('informa finalización y cancela limpiamente mediante el gestor real', async () => {
    const manager = new ExportManager()
    const completedProgress: ExportProgress[] = []
    const completedPath = join(directory, 'managed-image.png')
    await manager.exportImage(
      {
        jobId: 'managed-complete',
        sourcePath: imageSource,
        destinationPath: completedPath,
        layers: layers(),
        format: 'png',
      },
      (event) => completedProgress.push(event),
    )
    expect(completedProgress.at(-1)).toMatchObject({
      progress: 1,
      status: 'completed',
    })

    const cancelledPath = join(directory, 'cancelled.mp4')
    const cancelledProgress: ExportProgress[] = []
    const pending = manager.exportVideo(
      {
        jobId: 'managed-cancel',
        sourcePath: videoSource,
        destinationPath: cancelledPath,
        layers: layers(),
        profile: 'lossless',
      },
      (event) => cancelledProgress.push(event),
    )
    expect(manager.cancel('managed-cancel')).toBe(true)
    await expect(pending).resolves.toMatchObject({ cancelled: true })
    await expect(access(cancelledPath)).rejects.toThrow()
    expect(cancelledProgress.at(-1)?.status).toBe('cancelled')
    expect((await readdir(directory)).some((name) => name.includes('.partial'))).toBe(
      false,
    )
  }, 60_000)
})
