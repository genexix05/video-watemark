import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = join(projectRoot, 'build', 'media-bin')
const requestedPlatform = process.argv[2] ?? process.platform
const requestedArch = process.argv[3] ?? (requestedPlatform === 'win32' ? 'x64' : process.arch)
const extension = requestedPlatform === 'win32' ? '.exe' : ''
const temporaryDirectories = []

const unpackNpmBinary = async (packageName, filename) => {
  const directory = await mkdtemp(join(tmpdir(), 'watermark-media-'))
  try {
    const output = execFileSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['pack', packageName, '--pack-destination', directory, '--silent'],
      { cwd: projectRoot, encoding: 'utf8' },
    ).trim()
    const archive = join(directory, output.split(/\r?\n/).at(-1))
    execFileSync('tar', ['-xzf', archive, '-C', directory])
    const candidates = [
      join(directory, 'package', filename),
      join(directory, 'package', 'bin', filename),
    ]
    for (const candidate of candidates) {
      if (await readFile(candidate).then(() => true).catch(() => false)) {
        temporaryDirectories.push(directory)
        return candidate
      }
    }
    throw new Error(`${packageName} no contiene ${filename}`)
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

let ffmpegPath
let ffprobePath
if (requestedPlatform === process.platform && requestedArch === process.arch) {
  ffmpegPath = require('ffmpeg-static')
  ffprobePath = require('ffprobe-static').path
} else if (requestedPlatform === 'win32' && requestedArch === 'x64') {
  ffmpegPath = await unpackNpmBinary('@ffmpeg-installer/win32-x64@4.1.0', 'ffmpeg.exe')
  ffprobePath = await unpackNpmBinary('@ffprobe-installer/win32-x64@5.1.0', 'ffprobe.exe')
} else {
  throw new Error(`No hay binarios reproducibles para ${requestedPlatform}/${requestedArch}.`)
}

await rm(destination, { recursive: true, force: true })
await mkdir(destination, { recursive: true })

const targets = [
  [ffmpegPath, join(destination, `ffmpeg${extension}`)],
  [ffprobePath, join(destination, `ffprobe${extension}`)],
]

for (const [source, target] of targets) {
  await copyFile(source, target)
  const header = await readFile(target)
  if (requestedPlatform === 'win32' && header.subarray(0, 2).toString() !== 'MZ') {
    throw new Error(`${basename(target)} no es un ejecutable PE de Windows.`)
  }
  if (requestedPlatform !== 'win32') await chmod(target, 0o755)
}

await writeFile(
  join(destination, 'media-binaries.json'),
  JSON.stringify({
    platform: requestedPlatform,
    arch: requestedArch,
    ffmpeg: basename(targets[0][1]),
    ffprobe: basename(targets[1][1]),
  }, null, 2),
)

await Promise.all(
  temporaryDirectories.map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ),
)

console.log(`FFmpeg y FFprobe preparados para ${requestedPlatform}/${requestedArch}`)
