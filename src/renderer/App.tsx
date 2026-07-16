import { useEffect, useRef, useState } from 'react'
import type {
  ExportProgress,
  ImageFormat,
  RuntimeInfo,
  SelectedFile,
  VideoQualityProfile,
  WatermarkLayer as ExportLayer,
} from '../shared/api'
import { EditorCanvas } from './components/EditorCanvas'
import { Icon } from './components/Icons'
import { PropertiesPanel } from './components/PropertiesPanel'
import { Timeline } from './components/Timeline'
import type { LayerPatch, MediaSource, WatermarkLayer } from './editor-types'
import './styles.css'

const getImageDimensions = (file: SelectedFile) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error(`No se pudo abrir ${file.name}.`))
    image.src = file.previewUrl
  })

const errorMessage = (reason: unknown): string => {
  const fallback = 'No se pudo completar la operación.'
  if (!(reason instanceof Error)) return fallback
  return reason.message.replace(/^Error invoking remote method '[^']+':\s*/, '') || fallback
}

const exportExtension = (
  kind: MediaSource['kind'],
  format: ImageFormat,
): string => {
  if (kind === 'video') return 'mp4'
  return format === 'jpeg' ? 'jpg' : format
}

export default function App() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [media, setMedia] = useState<MediaSource | null>(null)
  const [layers, setLayers] = useState<WatermarkLayer[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [error, setError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [imageFormat, setImageFormat] = useState<ImageFormat>('png')
  const [videoProfile, setVideoProfile] = useState<VideoQualityProfile>('high')
  const [quality, setQuality] = useState(90)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [completedPath, setCompletedPath] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    void window.watermarkApi.getRuntimeInfo().then(setRuntime).catch(() => undefined)
    return window.watermarkApi.onExportProgress(setProgress)
  }, [])

  const openMedia = async () => {
    setError(null)
    const file = await window.watermarkApi.selectMedia().catch((reason) => {
      setError(errorMessage(reason))
      return null
    })
    if (!file) return
    try {
      const metadata = await window.watermarkApi.probeMedia(file.path)
      setMedia({
        path: file.path,
        name: file.name,
        url: file.previewUrl,
        kind: metadata.kind,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration ?? 0,
        fps: metadata.fps,
        videoCodec: metadata.videoCodec,
        audioCodec: metadata.audioCodec,
        hasAudio: metadata.hasAudio,
        rotation: metadata.rotation,
      })
      setLayers([])
      setSelectedId(null)
      setCurrentTime(0)
      setIsPlaying(false)
      setError(null)
      setZoom(100)
      setCompletedPath(null)
      setProgress(null)
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  const addWatermarks = async () => {
    if (!media) return
    setError(null)
    const files = await window.watermarkApi.selectWatermarks().catch((reason) => {
      setError(errorMessage(reason))
      return []
    })
    if (files.length === 0) return

    const additions = await Promise.all(
      files.map(async (file, index): Promise<WatermarkLayer | null> => {
        try {
          const dimensions = await getImageDimensions(file)
          const width = Math.min(
            media.width * 0.24,
            dimensions.width,
            media.width * 0.65,
          )
          const height = width / (dimensions.width / dimensions.height)
          return {
            id: crypto.randomUUID(),
            name: file.name,
            sourcePath: file.path,
            url: file.previewUrl,
            naturalWidth: dimensions.width,
            naturalHeight: dimensions.height,
            width,
            height,
            x: (media.width - width) / 2 + index * 12,
            y: (media.height - height) / 2 + index * 12,
            rotation: 0,
            opacity: 1,
            startTime: 0,
            endTime: media.duration,
            visible: true,
          }
        } catch {
          return null
        }
      }),
    )

    const validAdditions = additions.filter(
      (layer): layer is WatermarkLayer => layer !== null,
    )
    setLayers((current) => [...current, ...validAdditions])
    setSelectedId(validAdditions.at(-1)?.id ?? null)
    setError(
      validAdditions.length < files.length
        ? 'Algunas imágenes no pudieron añadirse.'
        : null,
    )
  }

  const updateLayer = (id: string, patch: LayerPatch) => {
    setLayers((current) =>
      current.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    )
  }

  const deleteLayer = (id: string) => {
    setLayers((current) => current.filter((layer) => layer.id !== id))
    setSelectedId((current) => (current === id ? null : current))
  }

  const reorderLayer = (id: string, direction: -1 | 1) => {
    setLayers((current) => {
      const from = current.findIndex((layer) => layer.id === id)
      const to = from + direction
      if (from < 0 || to < 0 || to >= current.length) return current
      const reordered = [...current]
      ;[reordered[from], reordered[to]] = [reordered[to], reordered[from]]
      return reordered
    })
  }

  const seek = (time: number) => {
    const nextTime = Math.max(0, Math.min(time, media?.duration ?? 0))
    if (videoRef.current) videoRef.current.currentTime = nextTime
    setCurrentTime(nextTime)
  }

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }

  const resetProject = () => {
    setMedia(null)
    setLayers([])
    setSelectedId(null)
    setError(null)
    setCurrentTime(0)
    setIsPlaying(false)
    setExportOpen(false)
    setProgress(null)
    setCompletedPath(null)
  }

  const exportLayers = (): ExportLayer[] =>
    layers
      .filter((layer) => layer.visible)
      .map((layer, order) => ({
        id: layer.id,
        sourcePath: layer.sourcePath,
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation: layer.rotation,
        opacity: layer.opacity,
        order,
        ...(media?.kind === 'video'
          ? { startTime: layer.startTime, endTime: layer.endTime }
          : {}),
      }))

  const startExport = async () => {
    if (!media || exporting) return
    if (layers.length === 0) {
      setError('Añade al menos una marca de agua antes de exportar.')
      setExportOpen(false)
      return
    }
    if (exportLayers().length === 0) {
      setError('Activa al menos una marca de agua antes de exportar.')
      setExportOpen(false)
      return
    }

    const baseName = media.name.replace(/\.[^.]+$/, '')
    const extension = exportExtension(media.kind, imageFormat)
    const destinationPath = await window.watermarkApi
      .selectDestination(media.kind, `${baseName}-con-marca.${extension}`)
      .catch((reason) => {
        setError(errorMessage(reason))
        return null
      })
    if (!destinationPath) return

    const jobId = crypto.randomUUID()
    setExportOpen(false)
    setExporting(true)
    setCompletedPath(null)
    setError(null)
    setProgress({
      jobId,
      progress: 0,
      processedSeconds: 0,
      totalSeconds: media.kind === 'video' ? media.duration : null,
      status: 'running',
    })
    try {
      const requestBase = {
        jobId,
        sourcePath: media.path,
        destinationPath,
        layers: exportLayers(),
      }
      const result =
        media.kind === 'image'
          ? await window.watermarkApi.exportImage({
              ...requestBase,
              format: imageFormat,
              quality,
            })
          : await window.watermarkApi.exportVideo({
              ...requestBase,
              profile: videoProfile,
              metadata: {
                path: media.path,
                kind: media.kind,
                width: media.width,
                height: media.height,
                duration: media.duration,
                fps: media.fps,
                videoCodec: media.videoCodec,
                audioCodec: media.audioCodec,
                hasAudio: media.hasAudio,
                rotation: media.rotation,
              },
            })
      if (result.cancelled) {
        setError('La exportación se canceló y se eliminó el archivo incompleto.')
      } else {
        setCompletedPath(result.destinationPath)
      }
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setExporting(false)
    }
  }

  const cancelExport = async () => {
    if (!progress || !exporting) return
    const cancelled = await window.watermarkApi.cancelExport(progress.jobId)
    if (!cancelled) setError('La exportación ya había terminado.')
  }

  if (!media) {
    return (
      <main className="welcome-shell">
        <header className="welcome-header">
          <Brand />
          <span className="local-badge">
            <span aria-hidden="true" className="status-dot" />{' '}
            100% local
          </span>
        </header>
        <section className="welcome-content">
          <div className="welcome-copy">
            <span className="eyebrow">Estudio de composición</span>
            <h1>Tu marca, en el lugar perfecto.</h1>
            <p>
              Superpón logotipos en fotos y vídeos con precisión, sin subir
              ningún archivo a internet.
            </p>
          </div>
          <button
            className="drop-card"
            onClick={() => void openMedia()}
            type="button"
          >
            <span className="upload-orbit">
              <Icon name="upload" />
            </span>
            <strong>Selecciona una foto o vídeo</strong>
            <span>Se abrirá el selector seguro del sistema</span>
            <small>JPG, PNG, WebP, MP4, MOV, WebM y más</small>
          </button>
          {error && <p className="error-message" role="alert">{error}</p>}
        </section>
        <footer className="welcome-footer">
          <span>Privado por diseño</span>
          <span>•</span>
          <span>{runtime ? `Electron ${runtime.versions.electron}` : 'Preparando entorno…'}</span>
        </footer>
      </main>
    )
  }

  return (
    <main className="editor-shell">
      <header className="app-header">
        <Brand compact />
        <div className="project-name">
          <Icon name={media.kind} />
          <span>
            <strong>{media.name}</strong>
            <small>
              {media.width} × {media.height}
              {media.kind === 'video' ? ` · ${media.duration.toFixed(1)} s` : ''}
            </small>
          </span>
        </div>
        <div className="header-actions">
          <button
            className="ghost-button"
            disabled={exporting}
            onClick={resetProject}
            type="button"
          >
            <Icon name="back" />
            Cambiar archivo
          </button>
          <button
            className="export-button"
            disabled={exporting || layers.length === 0}
            onClick={() => setExportOpen(true)}
            type="button"
          >
            {exporting ? 'Exportando…' : 'Exportar'}
          </button>
        </div>
      </header>

      <section className="editor-workspace">
        <div className="canvas-column">
          <div className="canvas-toolbar">
            <button
              className="add-button"
              disabled={exporting}
              onClick={() => void addWatermarks()}
              type="button"
            >
              <Icon name="add" />
              Añadir marca
            </button>
            <div className="zoom-control">
              <button
                aria-label="Reducir zoom"
                onClick={() => setZoom((value) => Math.max(40, value - 10))}
                type="button"
              >
                −
              </button>
              <span>{zoom}%</span>
              <button
                aria-label="Aumentar zoom"
                onClick={() => setZoom((value) => Math.min(160, value + 10))}
                type="button"
              >
                +
              </button>
            </div>
          </div>

          <EditorCanvas
            currentTime={currentTime}
            layers={layers}
            media={media}
            onChange={updateLayer}
            onMediaTime={setCurrentTime}
            onPlaybackChange={setIsPlaying}
            onSelect={setSelectedId}
            selectedId={selectedId}
            videoRef={videoRef}
            zoom={zoom}
          />

          {error && <p className="error-toast" role="alert">{error}</p>}
          {completedPath && (
            <output className="success-toast">
              Exportación completada: {completedPath}
            </output>
          )}
        </div>

        <PropertiesPanel
          layers={layers}
          media={media}
          onChange={updateLayer}
          onDelete={deleteLayer}
          onReorder={reorderLayer}
          onSelect={setSelectedId}
          selectedId={selectedId}
        />
      </section>

      {media.kind === 'video' && (
        <Timeline
          currentTime={currentTime}
          duration={media.duration}
          isPlaying={isPlaying}
          layers={layers}
          onPlayToggle={togglePlayback}
          onSeek={seek}
          onSelect={setSelectedId}
          selectedId={selectedId}
        />
      )}

      {exporting && progress && (
        <section className="export-progress" aria-live="polite">
          <div>
            <strong>Exportando archivo</strong>
            <span>{Math.round(progress.progress * 100)}%</span>
          </div>
          <progress max="1" value={progress.progress} />
          <button onClick={() => void cancelExport()} type="button">
            Cancelar
          </button>
        </section>
      )}

      {exportOpen && (
        <ExportDialog
          imageFormat={imageFormat}
          kind={media.kind}
          onClose={() => setExportOpen(false)}
          onExport={() => void startExport()}
          onImageFormat={setImageFormat}
          onQuality={setQuality}
          onVideoProfile={setVideoProfile}
          quality={quality}
          videoProfile={videoProfile}
        />
      )}
    </main>
  )
}

function Brand({ compact = false }: Readonly<{ compact?: boolean }>) {
  return (
    <div className={`brand${compact ? ' is-compact' : ''}`}>
      <span className="brand-mark">
        <span />
      </span>
      <span className="brand-name">Watermark Studio</span>
    </div>
  )
}

function ExportDialog({
  kind,
  imageFormat,
  quality,
  videoProfile,
  onImageFormat,
  onQuality,
  onVideoProfile,
  onClose,
  onExport,
}: Readonly<{
  kind: MediaSource['kind']
  imageFormat: ImageFormat
  quality: number
  videoProfile: VideoQualityProfile
  onImageFormat: (format: ImageFormat) => void
  onQuality: (quality: number) => void
  onVideoProfile: (profile: VideoQualityProfile) => void
  onClose: () => void
  onExport: () => void
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      aria-labelledby="export-title"
      className="export-dialog"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      ref={dialogRef}
    >
        <h2 id="export-title">Opciones de exportación</h2>
        {kind === 'image' ? (
          <>
            <label>
              <span>Formato</span>
              <select
                onChange={(event) => onImageFormat(event.target.value as ImageFormat)}
                value={imageFormat}
              >
                <option value="png">PNG (sin pérdida)</option>
                <option value="jpeg">JPEG</option>
                <option value="webp">WebP</option>
              </select>
            </label>
            {imageFormat !== 'png' && (
              <label>
                Calidad: {quality}%
                <input
                  max="100"
                  min="1"
                  onChange={(event) => onQuality(Number(event.target.value))}
                  type="range"
                  value={quality}
                />
              </label>
            )}
          </>
        ) : (
          <label>
            <span>Perfil</span>
            <select
              onChange={(event) =>
                onVideoProfile(event.target.value as VideoQualityProfile)
              }
              value={videoProfile}
            >
              <option value="high">Alta calidad (recomendado)</option>
              <option value="lossless">Sin pérdida (archivo muy grande)</option>
              <option value="compact">Archivo compacto</option>
            </select>
          </label>
        )}
        <p>
          El archivo se procesa localmente. En el siguiente paso podrás elegir
          nombre, formato de contenedor y destino.
        </p>
        <div className="dialog-actions">
          <button className="ghost-button" onClick={onClose} type="button">
            Volver
          </button>
          <button className="export-button" onClick={onExport} type="button">
            Elegir destino
          </button>
        </div>
    </dialog>
  )
}
