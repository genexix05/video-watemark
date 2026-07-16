import { app } from 'electron'
import { join } from 'node:path'

export interface MediaBinaryPaths {
  ffmpeg: string
  ffprobe: string
}

export const getMediaBinaryPaths = (): MediaBinaryPaths => {
  const extension = process.platform === 'win32' ? '.exe' : ''

  if (app.isPackaged) {
    return {
      ffmpeg: join(process.resourcesPath, 'bin', `ffmpeg${extension}`),
      ffprobe: join(process.resourcesPath, 'bin', `ffprobe${extension}`),
    }
  }

  return {
    ffmpeg: join(process.cwd(), 'node_modules', 'ffmpeg-static', `ffmpeg${extension}`),
    ffprobe: join(
      process.cwd(),
      'node_modules',
      'ffprobe-static',
      'bin',
      process.platform,
      process.arch,
      `ffprobe${extension}`,
    ),
  }
}
