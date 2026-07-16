export type MediaKind = 'image' | 'video'

export interface MediaSource {
  path: string
  name: string
  url: string
  kind: MediaKind
  width: number
  height: number
  duration: number
  fps: number | null
  videoCodec: string | null
  audioCodec: string | null
  hasAudio: boolean
  rotation: number
}

export interface WatermarkLayer {
  id: string
  name: string
  sourcePath: string
  url: string
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

export type LayerPatch = Partial<
  Pick<
    WatermarkLayer,
    | 'x'
    | 'y'
    | 'width'
    | 'height'
    | 'rotation'
    | 'opacity'
    | 'startTime'
    | 'endTime'
    | 'visible'
  >
>
