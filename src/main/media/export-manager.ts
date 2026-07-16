import { rename, unlink } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type {
  ExportImageRequest,
  ExportProgress,
  ExportResult,
  ExportVideoRequest,
} from '../../shared/api'
import { exportImage } from './export-image'
import { exportVideo } from './export-video'
import { validateExportRequest } from './validation'

type ProgressListener = (progress: ExportProgress) => void

export class ExportManager {
  private readonly jobs = new Map<string, AbortController>()

  cancel(jobId: string): boolean {
    const controller = this.jobs.get(jobId)
    if (!controller) return false
    controller.abort()
    return true
  }

  exportImage(
    request: ExportImageRequest,
    onProgress: ProgressListener,
  ): Promise<ExportResult> {
    return this.run(request, onProgress, (stagedRequest, signal) =>
      exportImage(stagedRequest, signal),
    )
  }

  exportVideo(
    request: ExportVideoRequest,
    onProgress: ProgressListener,
  ): Promise<ExportResult> {
    return this.run(request, onProgress, (stagedRequest, signal) =>
      exportVideo(stagedRequest, onProgress, signal),
    )
  }

  private async run<T extends ExportImageRequest | ExportVideoRequest>(
    request: T,
    onProgress: ProgressListener,
    operation: (request: T, signal: AbortSignal) => Promise<ExportResult>,
  ): Promise<ExportResult> {
    if (this.jobs.has(request.jobId)) {
      throw new Error('Ya existe una exportación con ese identificador.')
    }
    const controller = new AbortController()
    this.jobs.set(request.jobId, controller)
    const extension = extname(request.destinationPath)
    const stem = basename(request.destinationPath, extension)
    const temporaryPath = join(
      dirname(request.destinationPath),
      `.${stem}.${request.jobId}.partial${extension}`,
    )
    const stagedRequest = { ...request, destinationPath: temporaryPath } as T

    try {
      await validateExportRequest(request)
      if (!('profile' in request)) {
        onProgress({
          jobId: request.jobId,
          progress: 0,
          processedSeconds: 0,
          totalSeconds: null,
          status: 'running',
        })
      }
      const result = await operation(stagedRequest, controller.signal)
      await replaceDestination(temporaryPath, request.destinationPath)
      onProgress({
        jobId: request.jobId,
        progress: 1,
        processedSeconds: 'metadata' in request ? request.metadata?.duration ?? 0 : 0,
        totalSeconds: 'metadata' in request ? request.metadata?.duration ?? null : null,
        status: 'completed',
      })
      return { ...result, destinationPath: request.destinationPath }
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      if (controller.signal.aborted) {
        onProgress({
          jobId: request.jobId,
          progress: 0,
          processedSeconds: 0,
          totalSeconds: null,
          status: 'cancelled',
        })
        return {
          jobId: request.jobId,
          destinationPath: request.destinationPath,
          cancelled: true,
        }
      }
      const message = error instanceof Error ? error.message : 'Error desconocido.'
      onProgress({
        jobId: request.jobId,
        progress: 0,
        processedSeconds: 0,
        totalSeconds: null,
        status: 'failed',
        message,
      })
      throw error
    } finally {
      this.jobs.delete(request.jobId)
    }
  }
}

const replaceDestination = async (
  temporaryPath: string,
  destinationPath: string,
): Promise<void> => {
  try {
    await rename(temporaryPath, destinationPath)
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (code !== 'EEXIST' && code !== 'EPERM') throw error
    await unlink(destinationPath)
    await rename(temporaryPath, destinationPath)
  }
}
