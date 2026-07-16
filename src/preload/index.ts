import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type ExportImageRequest,
  type ExportProgress,
  type ExportVideoRequest,
  type MediaKind,
  type WatermarkApi,
} from '../shared/api'

const api: WatermarkApi = {
  getRuntimeInfo: () => ipcRenderer.invoke(IPC_CHANNELS.runtimeInfo),
  selectMedia: () => ipcRenderer.invoke(IPC_CHANNELS.selectMedia),
  selectWatermarks: () => ipcRenderer.invoke(IPC_CHANNELS.selectWatermarks),
  probeMedia: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.probe, path),
  selectDestination: (kind: MediaKind, suggestedName?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.selectDestination, kind, suggestedName),
  exportImage: (request: ExportImageRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.exportImage, request),
  exportVideo: (request: ExportVideoRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.exportVideo, request),
  cancelExport: (jobId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.cancelExport, jobId),
  onExportProgress: (listener: (progress: ExportProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ExportProgress): void =>
      listener(progress)
    ipcRenderer.on(IPC_CHANNELS.exportProgress, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.exportProgress, handler)
  },
}

contextBridge.exposeInMainWorld('watermarkApi', Object.freeze(api))
