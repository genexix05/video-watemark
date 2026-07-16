import { chmod, copyFile, mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ffmpegPath = require('ffmpeg-static')
const ffprobePath = require('ffprobe-static').path
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = join(projectRoot, 'build', 'media-bin')
const requestedPlatform = process.argv[2] ?? process.platform
const extension = process.platform === 'win32' ? '.exe' : ''

if (requestedPlatform !== process.platform) {
  throw new Error(
    `El paquete para ${requestedPlatform} debe generarse desde ese sistema operativo; ` +
      `la instalación actual contiene binarios para ${process.platform}/${process.arch}.`,
  )
}

if (!ffmpegPath || !ffprobePath) {
  throw new Error(`No hay binarios para ${process.platform}/${process.arch}`)
}

await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })

const targets = [
  [ffmpegPath, join(destination, `ffmpeg${extension}`)],
  [ffprobePath, join(destination, `ffprobe${extension}`)],
]

for (const [source, target] of targets) {
  await copyFile(source, target)
  if (process.platform !== 'win32') await chmod(target, 0o755)
}

console.log(`FFmpeg y FFprobe preparados para ${process.platform}/${process.arch}`)
