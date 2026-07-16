import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { LayerPatch, MediaSource, WatermarkLayer } from '../editor-types'
import { clamp, clientToMediaPoint, proportionalSize } from '../geometry'
import { Icon } from './Icons'

interface EditorCanvasProps {
  media: MediaSource
  layers: WatermarkLayer[]
  selectedId: string | null
  currentTime: number
  zoom: number
  videoRef: RefObject<HTMLVideoElement | null>
  onSelect: (id: string | null) => void
  onChange: (id: string, patch: LayerPatch) => void
  onMediaTime: (time: number) => void
  onPlaybackChange: (playing: boolean) => void
}

type Gesture = {
  id: string
  type: 'move' | 'resize' | 'rotate'
  pointerX: number
  pointerY: number
  layer: WatermarkLayer
  startAngle: number
}

export function EditorCanvas({
  media,
  layers,
  selectedId,
  currentTime,
  zoom,
  videoRef,
  onSelect,
  onChange,
  onMediaTime,
  onPlaybackChange,
}: EditorCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)

  const toMediaPoint = (event: ReactPointerEvent) => {
    const rect = stageRef.current!.getBoundingClientRect()
    return clientToMediaPoint(
      { x: event.clientX, y: event.clientY },
      rect,
      media.width,
      media.height,
    )
  }

  const beginGesture = (
    event: ReactPointerEvent,
    layer: WatermarkLayer,
    type: Gesture['type'],
  ) => {
    event.stopPropagation()
    onSelect(layer.id)
    const point = toMediaPoint(event)
    const centerX = layer.x + layer.width / 2
    const centerY = layer.y + layer.height / 2
    gesture.current = {
      id: layer.id,
      type,
      pointerX: point.x,
      pointerY: point.y,
      layer: { ...layer },
      startAngle:
        Math.atan2(point.y - centerY, point.x - centerX) * (180 / Math.PI) -
        layer.rotation,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueGesture = (event: ReactPointerEvent) => {
    const active = gesture.current
    if (!active) return
    const point = toMediaPoint(event)
    const { layer } = active

    if (active.type === 'move') {
      onChange(active.id, {
        x: clamp(
          layer.x + point.x - active.pointerX,
          -layer.width + 12,
          media.width - 12,
        ),
        y: clamp(
          layer.y + point.y - active.pointerY,
          -layer.height + 12,
          media.height - 12,
        ),
      })
      return
    }

    if (active.type === 'resize') {
      const deltaX = point.x - active.pointerX
      const deltaY = point.y - active.pointerY
      onChange(
        active.id,
        proportionalSize(
          layer.width,
          layer.naturalWidth,
          layer.naturalHeight,
          deltaX,
          deltaY,
          24,
          media.width * 2,
        ),
      )
      return
    }

    const centerX = layer.x + layer.width / 2
    const centerY = layer.y + layer.height / 2
    const angle =
      Math.atan2(point.y - centerY, point.x - centerX) * (180 / Math.PI)
    onChange(active.id, { rotation: Math.round(angle - active.startAngle) })
  }

  const endGesture = (event: ReactPointerEvent) => {
    if (gesture.current) {
      event.currentTarget.releasePointerCapture(event.pointerId)
      gesture.current = null
    }
  }

  const visibleLayers = layers.filter(
    (layer) =>
      layer.visible &&
      (media.kind === 'image' ||
        (currentTime >= layer.startTime && currentTime <= layer.endTime)),
  )

  return (
    <div className="canvas-scroll">
      <div
        className="canvas-scale"
        style={{
          width: `min(${zoom}%, calc((100cqh - 56px) * ${
            media.width / media.height
          } * ${zoom / 100}))`,
          aspectRatio: `${media.width} / ${media.height}`,
        }}
      >
        <div
          className="media-stage"
          ref={stageRef}
          onPointerDown={() => onSelect(null)}
        >
          {media.kind === 'image' ? (
            <img alt={`Previsualización de ${media.name}`} src={media.url} />
          ) : (
            <video
              aria-label={`Previsualización de ${media.name}`}
              onEnded={() => onPlaybackChange(false)}
              onPause={() => onPlaybackChange(false)}
              onPlay={() => onPlaybackChange(true)}
              onTimeUpdate={(event) => onMediaTime(event.currentTarget.currentTime)}
              ref={videoRef}
              src={media.url}
            />
          )}

          <div className="safe-area" aria-hidden="true" />

          {visibleLayers.map((layer) => {
            const selected = selectedId === layer.id
            return (
              <div
                className={`watermark-layer${selected ? ' is-selected' : ''}`}
                key={layer.id}
                onPointerDown={(event) => beginGesture(event, layer, 'move')}
                onPointerMove={continueGesture}
                onPointerUp={endGesture}
                onPointerCancel={endGesture}
                style={{
                  left: `${(layer.x / media.width) * 100}%`,
                  top: `${(layer.y / media.height) * 100}%`,
                  width: `${(layer.width / media.width) * 100}%`,
                  height: `${(layer.height / media.height) * 100}%`,
                  opacity: layer.opacity,
                  transform: `rotate(${layer.rotation}deg)`,
                }}
              >
                <img alt="" draggable={false} src={layer.url} />
                {selected && (
                  <>
                    <button
                      aria-label="Rotar marca"
                      className="transform-handle rotate-handle"
                      onPointerDown={(event) => beginGesture(event, layer, 'rotate')}
                      onPointerMove={continueGesture}
                      onPointerUp={endGesture}
                      onPointerCancel={endGesture}
                      type="button"
                    >
                      <Icon name="rotate" />
                    </button>
                    <button
                      aria-label="Redimensionar marca"
                      className="transform-handle resize-handle"
                      onPointerDown={(event) => beginGesture(event, layer, 'resize')}
                      onPointerMove={continueGesture}
                      onPointerUp={endGesture}
                      onPointerCancel={endGesture}
                      type="button"
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
