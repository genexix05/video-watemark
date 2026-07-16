import { spawn } from 'node:child_process'

export interface ProcessResult {
  stdout: string
  stderr: string
}

export class MediaProcessError extends Error {
  readonly stderr: string
  readonly exitCode: number | null

  constructor(message: string, stderr: string, exitCode: number | null) {
    super(message)
    this.name = 'MediaProcessError'
    this.stderr = stderr
    this.exitCode = exitCode
  }
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
          ),
        )
      }
    })
  })
