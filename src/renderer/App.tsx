import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ExportProgress,
  ImageFormat,
  PresetSummary,
  SelectedFile,
  VideoQualityProfile,
  WatermarkLayer as ExportLayer,
} from '../shared/api'
import { EditorCanvas } from './components/EditorCanvas'
import { Icon } from './components/Icons'
import { PropertiesPanel } from './components/PropertiesPanel'
import { PresetsPanel } from './components/PresetsPanel'
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

type Theme = 'dark' | 'light'
const initialTheme = (): Theme =>
  localStorage.getItem('watermark-theme') === 'light' ? 'light' : 'dark'

export default function App() {
  const [media, setMedia] = useState<MediaSource | null>(null)
  const [loadingMedia, setLoadingMedia] = useState(false)
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
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [presets, setPresets] = useState<PresetSummary[]>([])
  const videoRef = useRef<HTMLVideoElement>(null)
  const resumeAfterScrub = useRef(false)
  const scrubbingRef = useRef(false)

  useEffect(() => {
    void window.watermarkApi.listPresets().then(setPresets).catch(() => undefined)
    return window.watermarkApi.onExportProgress(setProgress)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('watermark-theme', theme)
  }, [theme])

  const openMedia = async () => {
    setError(null)
    const file = await window.watermarkApi.selectMedia().catch((reason) => {
      setError(errorMessage(reason))
      return null
    })
    if (!file) return
    setLoadingMedia(true)
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
      setLoadingMedia(false)
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

  const centerLayer = () => {
    if (!media || !selectedId) return
    const layer = layers.find((item) => item.id === selectedId)
    if (layer) {
      updateLayer(layer.id, {
        x: (media.width - layer.width) / 2,
        y: (media.height - layer.height) / 2,
      })
    }
  }

  const saveCurrentPreset = async () => {
    if (!media || layers.length === 0) return
    const name = window.prompt('Nombre del preset')
    if (!name) return
    try {
      const preset = await window.watermarkApi.savePreset({
        name,
        mediaWidth: media.width,
        mediaHeight: media.height,
        mediaDuration: media.duration,
        layers: layers.map((layer) => ({
          name: layer.name,
          sourcePath: layer.sourcePath,
          naturalWidth: layer.naturalWidth,
          naturalHeight: layer.naturalHeight,
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          rotation: layer.rotation,
          opacity: layer.opacity,
          startTime: layer.startTime,
          endTime: layer.endTime,
          visible: layer.visible,
        })),
      })
      setPresets((current) => [...current, preset])
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  const applySavedPreset = async (presetId: string) => {
    if (!media) return
    try {
      const preset = await window.watermarkApi.applyPreset(
        presetId,
        media.width,
        media.height,
        media.duration,
      )
      const additions: WatermarkLayer[] = preset.layers.map(
        ({ previewUrl, ...layer }) => ({ ...layer, url: previewUrl }),
      )
      setLayers((current) => [...current, ...additions])
      setSelectedId(additions.at(-1)?.id ?? null)
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  const removePreset = async (presetId: string) => {
    try {
      if (await window.watermarkApi.deletePreset(presetId)) {
        setPresets((current) => current.filter((preset) => preset.id !== presetId))
      }
    } catch (reason) {
      setError(errorMessage(reason))
    }
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

  const handleMediaTime = useCallback((time: number) => {
    if (scrubbingRef.current || videoRef.current?.seeking) return
    setCurrentTime(time)
  }, [])

  const startScrubbing = () => {
    const video = videoRef.current
    scrubbingRef.current = true
    resumeAfterScrub.current = Boolean(video && !video.paused)
    video?.pause()
  }

  const finishScrubbing = () => {
    const video = videoRef.current
    const shouldResume = resumeAfterScrub.current
    resumeAfterScrub.current = false

    const finish = () => {
      scrubbingRef.current = false
      if (video) setCurrentTime(video.currentTime)
      if (shouldResume && video) {
        void video.play().catch(() => setIsPlaying(false))
      }
    }

    if (video?.seeking) {
      video.addEventListener('seeked', finish, { once: true })
    } else {
      finish()
    }
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
    setLoadingMedia(false)
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
      <main className="editor-shell empty-editor-shell">
        <header className="app-header">
          <Brand compact />
          <div className="project-name is-empty">
            <span>
              <strong>Sin proyecto abierto</strong>
              <small>Editor local</small>
            </span>
          </div>
          <div className="header-actions">
          <button
            className="theme-toggle"
            onClick={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
            type="button"
          >
              {theme === 'dark' ? 'Claro' : 'Oscuro'}
          </button>
            <button className="export-button" onClick={() => void openMedia()} type="button">
              Abrir archivo
            </button>
          </div>
        </header>

        <section className="editor-workspace empty-workspace">
          <aside className="editor-tools" aria-label="Herramientas no disponibles">
            <button aria-label="Abrir archivo" onClick={() => void openMedia()} type="button">
              <Icon name="upload" />
            </button>
            <button aria-label="Añadir marca" disabled type="button">
              <Icon name="add" />
            </button>
          </aside>

          <div className="canvas-column">
            <div className="canvas-toolbar">
              <span className="empty-toolbar-label">Área de trabajo</span>
              <span className="empty-toolbar-meta">Ningún archivo seleccionado</span>
            </div>
            <div className="empty-canvas">
              <section className="new-project-panel">
                <Icon name="upload" />
                <h1>Abrir foto o vídeo</h1>
                <p>Crea un proyecto seleccionando un archivo de tu equipo.</p>
                <button
                  className="export-button"
                  onClick={() => void openMedia()}
                  type="button"
                >
                  Seleccionar archivo…
                </button>
                <small>JPG, PNG, WebP, MP4, MOV y WebM</small>
              </section>
              {error && <p className="error-toast" role="alert">{error}</p>}
            </div>
          </div>

          <aside className="right-dock empty-right-dock">
            <section className="empty-dock-panel">
              <h2>Proyecto</h2>
              <dl>
                <div><dt>Documento</dt><dd>Sin abrir</dd></div>
                <div><dt>Capas</dt><dd>0</dd></div>
              </dl>
            </section>
            <section className="empty-dock-panel">
              <h2>Presets</h2>
              <p>
                {presets.length === 0
                  ? 'No hay presets guardados.'
                  : `${presets.length} presets disponibles.`}
              </p>
              <small>Abre un archivo para aplicar uno.</small>
            </section>
          </aside>
        </section>
        {loadingMedia && <LoadingOverlay />}
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
            className="theme-toggle"
            onClick={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
            type="button"
          >
            {theme === 'dark' ? 'Claro' : 'Oscuro'}
          </button>
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
        <aside className="editor-tools" aria-label="Herramientas">
          <button
            aria-label="Añadir marca de agua"
            disabled={exporting}
            onClick={() => void addWatermarks()}
            type="button"
          >
            <Icon name="add" />
          </button>
          <button
            aria-label="Centrar capa"
            disabled={!selectedId}
            onClick={centerLayer}
            type="button"
          >
            ⊕
          </button>
        </aside>
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
            onLoadingChange={setLoadingMedia}
            onMediaTime={handleMediaTime}
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

        <aside className="right-dock">
          <PropertiesPanel
            layers={layers}
            media={media}
            onChange={updateLayer}
            onDelete={deleteLayer}
            onReorder={reorderLayer}
            onSelect={setSelectedId}
            selectedId={selectedId}
          />
          <PresetsPanel
            canSave={layers.length > 0}
            disabled={exporting}
            onApply={(id) => void applySavedPreset(id)}
            onDelete={(id) => void removePreset(id)}
            onSave={() => void saveCurrentPreset()}
            presets={presets}
          />
        </aside>
      </section>

      {media.kind === 'video' && (
        <Timeline
          currentTime={currentTime}
          duration={media.duration}
          isPlaying={isPlaying}
          layers={layers}
          onPlayToggle={togglePlayback}
          onScrubEnd={finishScrubbing}
          onScrubStart={startScrubbing}
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
      {loadingMedia && <LoadingOverlay />}
    </main>
  )
}

function Brand({ compact = false }: Readonly<{ compact?: boolean }>) {
  return (
    <div className={`brand${compact ? ' is-compact' : ''}`}>
      <span className="brand-mark">W</span>
      <span className="brand-name">Watermark Studio</span>
    </div>
  )
}

function LoadingOverlay() {
  return (
    <div className="media-loading-overlay" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <strong>Cargando archivo…</strong>
      <small>Los vídeos grandes pueden tardar unos segundos.</small>
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
