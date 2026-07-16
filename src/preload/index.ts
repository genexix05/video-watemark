import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type ExportImageRequest,
  type ExportProgress,
  type ExportVideoRequest,
  type MediaKind,
  type SavePresetRequest,
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
  listPresets: () => ipcRenderer.invoke(IPC_CHANNELS.listPresets),
  savePreset: (request: SavePresetRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.savePreset, request),
  applyPreset: (
    presetId: string,
    mediaWidth: number,
    mediaHeight: number,
    mediaDuration: number,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.applyPreset,
      presetId,
      mediaWidth,
      mediaHeight,
      mediaDuration,
    ),
  deletePreset: (presetId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.deletePreset, presetId),
  onExportProgress: (listener: (progress: ExportProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ExportProgress): void =>
      listener(progress)
    ipcRenderer.on(IPC_CHANNELS.exportProgress, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.exportProgress, handler)
  },
}

contextBridge.exposeInMainWorld('watermarkApi', Object.freeze(api))
