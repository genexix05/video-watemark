import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, extname, parse, resolve } from 'node:path'
import { Readable } from 'node:stream'
import {
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  type IpcMainInvokeEvent,
} from 'electron'
import {
  IPC_CHANNELS,
  type ExportImageRequest,
  type ExportProgress,
  type ExportVideoRequest,
  type SavePresetRequest,
  type SelectedFile,
} from '../../shared/api'
import { ExportManager } from './export-manager'
import { probeMedia } from './probe'
import {
  applyPreset,
  deletePreset,
  listPresets,
  savePreset,
} from './presets'

const exportManager = new ExportManager()
const approvedDestinations = new Map<number, Set<string>>()
const approvedMedia = new Map<number, Set<string>>()
const approvedWatermarks = new Map<number, Set<string>>()
const previewPaths = new Map<string, { ownerId: number; path: string }>()
const jobOwners = new Map<string, number>()
const trackedOwners = new Set<number>()

const mediaFilters = [
  {
    name: 'Fotos y vídeos',
    extensions: [
      'avi',
      'bmp',
      'gif',
      'jpeg',
      'jpg',
      'm4v',
      'mkv',
      'mov',
      'mp4',
      'png',
      'webm',
      'webp',
    ],
  },
]
const watermarkFilters = [
  { name: 'Imágenes', extensions: ['jpeg', 'jpg', 'png', 'webp'] },
]
const previewMimeTypes: Record<string, string> = {
  '.avi': 'video/x-msvideo',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
}

const ownerWindow = (event: IpcMainInvokeEvent): BrowserWindow | undefined =>
  BrowserWindow.fromWebContents(event.sender) ?? undefined

const clearPreviews = (ownerId: number): void => {
  for (const [token, preview] of previewPaths) {
    if (preview.ownerId === ownerId) previewPaths.delete(token)
  }
}

const trackOwner = (event: IpcMainInvokeEvent): number => {
  const ownerId = event.sender.id
  if (trackedOwners.has(ownerId)) return ownerId
  trackedOwners.add(ownerId)
  event.sender.once('destroyed', () => {
    clearPreviews(ownerId)
    approvedDestinations.delete(ownerId)
    approvedMedia.delete(ownerId)
    approvedWatermarks.delete(ownerId)
    trackedOwners.delete(ownerId)
    for (const [jobId, jobOwnerId] of jobOwners) {
      if (jobOwnerId === ownerId) exportManager.cancel(jobId)
    }
  })
  return ownerId
}

const selected = (ownerId: number, paths: readonly string[]): SelectedFile[] =>
  paths.map((path) => {
    const normalized = resolve(path)
    const token = randomUUID()
    previewPaths.set(token, { ownerId, path: normalized })
    return {
      path: normalized,
      name: basename(normalized),
      previewUrl: `media-preview://asset/${token}`,
    }
  })

const showOpenDialog = (
  event: IpcMainInvokeEvent,
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> => {
  const owner = ownerWindow(event)
  return owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options)
}

const showSaveDialog = (
  event: IpcMainInvokeEvent,
  options: Electron.SaveDialogOptions,
): Promise<Electron.SaveDialogReturnValue> => {
  const owner = ownerWindow(event)
  return owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options)
}

const progressTo = (
  event: IpcMainInvokeEvent,
): ((progress: ExportProgress) => void) => {
  const sender = event.sender
  return (progress) => {
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.exportProgress, progress)
  }
}

const assertPath = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('La ruta no es válida.')
  }
  return value
}

const consumeApprovedDestination = (
  ownerId: number,
  destinationPath: unknown,
): void => {
  const destination = resolve(assertPath(destinationPath))
  if (!approvedDestinations.get(ownerId)?.delete(destination)) {
    throw new Error('Selecciona el archivo de destino antes de exportar.')
  }
}

const assertApproved = (
  approvals: Map<number, Set<string>>,
  ownerId: number,
  path: unknown,
  message: string,
): string => {
  const normalized = resolve(assertPath(path))
  if (!approvals.get(ownerId)?.has(normalized)) throw new Error(message)
  return normalized
}

function assertExportRequest(
  request: unknown,
): asserts request is ExportImageRequest | ExportVideoRequest {
  if (!request || typeof request !== 'object') {
    throw new Error('La solicitud de exportación no es válida.')
  }
  if (!('layers' in request) || !Array.isArray(request.layers)) {
    throw new Error('Las capas de exportación no son válidas.')
  }
}

export const registerMediaPreviewProtocol = (): void => {
  protocol.handle('media-preview', async (request) => {
    const url = new URL(request.url)
    const token = url.pathname.slice(1)
    const preview = url.hostname === 'asset' ? previewPaths.get(token) : undefined
    if (!preview) return new Response('Recurso no autorizado.', { status: 404 })

    try {
      const file = await stat(preview.path)
      const range = request.headers.get('range')
      const contentType =
        previewMimeTypes[extname(preview.path).toLowerCase()] ?? 'application/octet-stream'

      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim())
        if (!match) {
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${file.size}` },
          })
        }

        const requestedStart = match[1] ? Number(match[1]) : undefined
        const requestedEnd = match[2] ? Number(match[2]) : undefined
        const suffixRange = requestedStart === undefined
        const start =
          requestedStart ??
          Math.max(0, file.size - Math.max(0, requestedEnd ?? 0))
        const end = suffixRange
          ? file.size - 1
          : Math.min(requestedEnd ?? file.size - 1, file.size - 1)

        if (!Number.isSafeInteger(start) || start < 0 || start > end || start >= file.size) {
          return new Response(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${file.size}` },
          })
        }

        const stream = Readable.toWeb(
          createReadStream(preview.path, { start, end }),
        ) as ReadableStream<Uint8Array>
        return new Response(request.method === 'HEAD' ? null : stream, {
          status: 206,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${file.size}`,
            'Content-Type': contentType,
          },
        })
      }

      const stream = Readable.toWeb(
        createReadStream(preview.path),
      ) as ReadableStream<Uint8Array>
      return new Response(request.method === 'HEAD' ? null : stream, {
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(file.size),
          'Content-Type': contentType,
        },
      })
    } catch {
      return new Response('No se pudo abrir el recurso.', { status: 404 })
    }
  })
}

export const registerMediaIpc = (): void => {
  ipcMain.handle(IPC_CHANNELS.listPresets, () => listPresets())

  ipcMain.handle(IPC_CHANNELS.savePreset, async (event, request: unknown) => {
    if (!request || typeof request !== 'object' || !('layers' in request) || !Array.isArray(request.layers)) {
      throw new Error('Los datos del preset no son válidos.')
    }
    const ownerId = trackOwner(event)
    request.layers.forEach((layer) =>
      assertApproved(
        approvedWatermarks,
        ownerId,
        layer && typeof layer === 'object' && 'sourcePath' in layer
          ? layer.sourcePath
          : undefined,
        'Una imagen del preset no está autorizada.',
      ),
    )
    return savePreset(request as SavePresetRequest)
  })

  ipcMain.handle(
    IPC_CHANNELS.applyPreset,
    async (
      event,
      presetId: unknown,
      mediaWidth: unknown,
      mediaHeight: unknown,
      mediaDuration: unknown,
    ) => {
      const ownerId = trackOwner(event)
      const preset = await applyPreset(presetId, mediaWidth, mediaHeight, mediaDuration)
      const files = selected(ownerId, preset.layers.map((layer) => layer.sourcePath))
      const approvals = approvedWatermarks.get(ownerId) ?? new Set<string>()
      files.forEach((file) => approvals.add(file.path))
      approvedWatermarks.set(ownerId, approvals)
      return {
        ...preset,
        layers: preset.layers.map((layer, index) => ({
          ...layer,
          previewUrl: files[index].previewUrl,
        })),
      }
    },
  )

  ipcMain.handle(IPC_CHANNELS.deletePreset, (_event, presetId: unknown) =>
    deletePreset(presetId),
  )

  ipcMain.handle(IPC_CHANNELS.selectMedia, async (event) => {
    const result = await showOpenDialog(event, {
      title: 'Seleccionar foto o vídeo',
      properties: ['openFile'],
      filters: mediaFilters,
    })
    if (result.canceled) return null
    const ownerId = trackOwner(event)
    clearPreviews(ownerId)
    const files = selected(ownerId, result.filePaths)
    approvedMedia.set(ownerId, new Set(files.map((file) => file.path)))
    approvedWatermarks.set(ownerId, new Set())
    return files[0] ?? null
  })

  ipcMain.handle(IPC_CHANNELS.selectWatermarks, async (event) => {
    const result = await showOpenDialog(event, {
      title: 'Seleccionar marcas de agua',
      properties: ['openFile', 'multiSelections'],
      filters: watermarkFilters,
    })
    if (result.canceled) return []
    const ownerId = trackOwner(event)
    const files = selected(ownerId, result.filePaths)
    const approvals = approvedWatermarks.get(ownerId) ?? new Set<string>()
    files.forEach((file) => approvals.add(file.path))
    approvedWatermarks.set(ownerId, approvals)
    return files
  })

  ipcMain.handle(IPC_CHANNELS.probe, (event, path: unknown) =>
    probeMedia(
      assertApproved(
        approvedMedia,
        trackOwner(event),
        path,
        'Selecciona primero el archivo de origen.',
      ),
    ),
  )

  ipcMain.handle(
    IPC_CHANNELS.selectDestination,
    async (event, kind: unknown, suggestedName?: unknown) => {
      if (kind !== 'image' && kind !== 'video') {
        throw new Error('El tipo de archivo no es válido.')
      }
      const ownerId = trackOwner(event)
      const safeSuggestion =
        typeof suggestedName === 'string' && suggestedName.trim()
          ? basename(suggestedName)
          : kind === 'image'
            ? 'imagen-con-marca.png'
            : 'video-con-marca.mp4'
      const parsed = parse(safeSuggestion)
      const defaultPath = extname(safeSuggestion)
        ? safeSuggestion
        : `${parsed.name}.${kind === 'image' ? 'png' : 'mp4'}`
      const filters =
        kind === 'image'
          ? [{ name: 'Imagen', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
          : [{ name: 'Vídeo', extensions: ['mp4', 'mkv', 'mov', 'webm'] }]
      const result = await showSaveDialog(event, {
        title: 'Guardar exportación',
        defaultPath,
        filters,
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      })
      if (result.canceled || !result.filePath) return null
      const destinations =
        approvedDestinations.get(ownerId) ?? new Set<string>()
      destinations.add(resolve(result.filePath))
      approvedDestinations.set(ownerId, destinations)
      return result.filePath
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.exportImage,
    async (event, request: unknown) => {
      assertExportRequest(request)
      const ownerId = trackOwner(event)
      if (!('format' in request)) {
        throw new Error('La solicitud no corresponde a una imagen.')
      }
      assertApproved(
        approvedMedia,
        ownerId,
        request.sourcePath,
        'El origen no fue seleccionado por esta ventana.',
      )
      request.layers.forEach((layer) =>
        assertApproved(
          approvedWatermarks,
          ownerId,
          layer?.sourcePath,
          'Una marca de agua no fue seleccionada por esta ventana.',
        ),
      )
      consumeApprovedDestination(ownerId, request.destinationPath)
      if (jobOwners.has(request.jobId)) {
        throw new Error('Ya existe una exportación con ese identificador.')
      }
      jobOwners.set(request.jobId, ownerId)
      try {
        return await exportManager.exportImage(
          request as ExportImageRequest,
          progressTo(event),
        )
      } finally {
        jobOwners.delete(request.jobId)
      }
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.exportVideo,
    async (event, request: unknown) => {
      assertExportRequest(request)
      const ownerId = trackOwner(event)
      if (!('profile' in request)) {
        throw new Error('La solicitud no corresponde a un vídeo.')
      }
      assertApproved(
        approvedMedia,
        ownerId,
        request.sourcePath,
        'El origen no fue seleccionado por esta ventana.',
      )
      request.layers.forEach((layer) =>
        assertApproved(
          approvedWatermarks,
          ownerId,
          layer?.sourcePath,
          'Una marca de agua no fue seleccionada por esta ventana.',
        ),
      )
      consumeApprovedDestination(ownerId, request.destinationPath)
      if (jobOwners.has(request.jobId)) {
        throw new Error('Ya existe una exportación con ese identificador.')
      }
      jobOwners.set(request.jobId, ownerId)
      try {
        return await exportManager.exportVideo(
          request as ExportVideoRequest,
          progressTo(event),
        )
      } finally {
        jobOwners.delete(request.jobId)
      }
    },
  )
  ipcMain.handle(IPC_CHANNELS.cancelExport, (event, jobId: unknown) => {
    const normalizedJobId = assertPath(jobId)
    if (jobOwners.get(normalizedJobId) !== event.sender.id) return false
    return exportManager.cancel(normalizedJobId)
  })
}
