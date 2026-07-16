export interface RuntimeInfo {
  platform: string
  versions: {
    electron: string
    chrome: string
    node: string
  }
  mediaBinaries: {
    ffmpeg: string
    ffprobe: string
  }
}

export type MediaKind = 'image' | 'video'
export type ImageFormat = 'png' | 'jpeg' | 'webp'
export type VideoQualityProfile = 'high' | 'lossless' | 'compact'

export const IPC_CHANNELS = {
  runtimeInfo: 'app:get-runtime-info',
  selectMedia: 'media:select',
  selectWatermarks: 'media:select-watermarks',
  probe: 'media:probe',
  selectDestination: 'media:select-destination',
  exportImage: 'media:export-image',
  exportVideo: 'media:export-video',
  cancelExport: 'media:cancel-export',
  exportProgress: 'media:export-progress',
  listPresets: 'presets:list',
  savePreset: 'presets:save',
  applyPreset: 'presets:apply',
  deletePreset: 'presets:delete',
} as const

export interface MediaMetadata {
  path: string
  kind: MediaKind
  width: number
  height: number
  duration: number | null
  fps: number | null
  videoCodec: string | null
  audioCodec: string | null
  hasAudio: boolean
  rotation: number
}

export interface SelectedFile {
  path: string
  name: string
  previewUrl: string
}

export interface WatermarkLayer {
  id: string
  sourcePath: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  order: number
  startTime?: number
  endTime?: number
}

export interface PresetLayerInput {
  name: string
  sourcePath: string
  naturalWidth: number
  naturalHeight: number
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  startTime: number
  endTime: number
  visible: boolean
}

export interface SavePresetRequest {
  name: string
  mediaWidth: number
  mediaHeight: number
  mediaDuration: number
  layers: PresetLayerInput[]
}

export interface PresetSummary {
  id: string
  name: string
  layerCount: number
  createdAt: string
}

export interface AppliedPresetLayer extends PresetLayerInput {
  id: string
  previewUrl: string
}

export interface AppliedPreset {
  id: string
  name: string
  layers: AppliedPresetLayer[]
}

interface ExportBaseRequest {
  jobId: string
  sourcePath: string
  destinationPath: string
  layers: WatermarkLayer[]
}

export interface ExportImageRequest extends ExportBaseRequest {
  format: ImageFormat
  quality?: number
}

export interface ExportVideoRequest extends ExportBaseRequest {
  profile: VideoQualityProfile
  metadata?: MediaMetadata
}

export type ExportRequest = ExportImageRequest | ExportVideoRequest

export interface ExportResult {
  jobId: string
  destinationPath: string
  cancelled: boolean
}

export interface ExportProgress {
  jobId: string
  progress: number
  processedSeconds: number
  totalSeconds: number | null
  status: 'running' | 'completed' | 'cancelled' | 'failed'
  message?: string
}

export interface WatermarkApi {
  getRuntimeInfo: () => Promise<RuntimeInfo>
  selectMedia: () => Promise<SelectedFile | null>
  selectWatermarks: () => Promise<SelectedFile[]>
  probeMedia: (path: string) => Promise<MediaMetadata>
  selectDestination: (
    kind: MediaKind,
    suggestedName?: string,
  ) => Promise<string | null>
  exportImage: (request: ExportImageRequest) => Promise<ExportResult>
  exportVideo: (request: ExportVideoRequest) => Promise<ExportResult>
  cancelExport: (jobId: string) => Promise<boolean>
  listPresets: () => Promise<PresetSummary[]>
  savePreset: (request: SavePresetRequest) => Promise<PresetSummary>
  applyPreset: (
    presetId: string,
    mediaWidth: number,
    mediaHeight: number,
    mediaDuration: number,
  ) => Promise<AppliedPreset>
  deletePreset: (presetId: string) => Promise<boolean>
  onExportProgress: (listener: (progress: ExportProgress) => void) => () => void
}
