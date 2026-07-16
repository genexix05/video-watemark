import { spawn } from 'node:child_process'

export interface ProcessResult {
  stdout: string
  stderr: string
}

export class MediaProcessError extends Error {
  readonly stderr: string
  readonly exitCode: number | null
  readonly command: string
  readonly context: string

  constructor(
    message: string,
    stderr: string,
    exitCode: number | null,
    command = 'proceso multimedia',
    context = '',
  ) {
    const detail = usefulStderr(stderr)
    super([message, context, detail].filter(Boolean).join('\n'))
    this.name = 'MediaProcessError'
    this.stderr = stderr
    this.exitCode = exitCode
    this.command = command
    this.context = context
  }
}

export const usefulStderr = (stderr: string, maximum = 2_000): string => {
  const normalized = stderr.replace(/\r/g, '').trim()
  if (!normalized) return 'FFmpeg no proporcionó detalles adicionales.'
  const lines = normalized.split('\n')
  const useful = lines.slice(Math.max(0, lines.length - 12)).join('\n')
  return useful.length > maximum ? `…${useful.slice(-maximum)}` : useful
}

export const runProcess = (
  executable: string,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<ProcessResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', (error) => reject(error))
    child.once('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(
          new MediaProcessError(
            `El proceso multimedia terminó con código ${code ?? 'desconocido'}.`,
            stderr,
            code,
            executable.split(/[\\/]/).at(-1) ?? 'proceso multimedia',
            `Argumentos: ${args.map((argument) => (argument.includes('/') || argument.includes('\\') ? '<archivo>' : argument)).join(' ')}`,
          ),
        )
      }
    })
  })
