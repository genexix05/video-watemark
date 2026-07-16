import { useRef } from 'react'
import type { WatermarkLayer } from '../editor-types'
import { Icon } from './Icons'

interface TimelineProps {
  duration: number
  currentTime: number
  isPlaying: boolean
  layers: WatermarkLayer[]
  selectedId: string | null
  onPlayToggle: () => void
  onSeek: (time: number) => void
  onScrubStart: () => void
  onScrubEnd: () => void
  onSelect: (id: string) => void
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '00:00.0'
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${remainder
    .toFixed(1)
    .padStart(4, '0')}`
}

export function Timeline({
  duration,
  currentTime,
  isPlaying,
  layers,
  selectedId,
  onPlayToggle,
  onSeek,
  onScrubStart,
  onScrubEnd,
  onSelect,
}: Readonly<TimelineProps>) {
  const safeDuration = Math.max(duration, 0.01)
  const playhead = (currentTime / safeDuration) * 100
  const scrubbingRef = useRef(false)

  const finishScrubbing = () => {
    if (!scrubbingRef.current) return
    scrubbingRef.current = false
    onScrubEnd()
  }

  return (
    <section className="timeline">
      <div className="timeline-header">
        <button
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          className="play-button"
          onClick={onPlayToggle}
          type="button"
        >
          <Icon name={isPlaying ? 'pause' : 'play'} />
        </button>
        <span className="timecode">{formatTime(currentTime)}</span>
        <span className="time-divider">/</span>
        <span className="timecode is-muted">{formatTime(duration)}</span>
      </div>

      <div className="timeline-body">
        <div className="timeline-labels" aria-hidden="true">
          <span>0:00</span>
          <span>{formatTime(duration / 2).slice(0, 5)}</span>
          <span>{formatTime(duration).slice(0, 5)}</span>
        </div>
        <div
          className="timeline-track-area"
          style={{ minHeight: `${Math.max(58, layers.length * 16 + 36)}px` }}
        >
          <input
            aria-label="Posición de reproducción"
            className="timeline-seeker"
            max={safeDuration}
            min="0"
            onChange={(event) => onSeek(Number(event.currentTarget.value))}
            onInput={(event) => onSeek(Number(event.currentTarget.value))}
            onPointerCancel={finishScrubbing}
            onPointerDown={() => {
              if (scrubbingRef.current) return
              scrubbingRef.current = true
              onScrubStart()
            }}
            onPointerUp={finishScrubbing}
            step="0.01"
            type="range"
            value={Math.min(currentTime, safeDuration)}
          />
          <div className="timeline-ruler" aria-hidden="true" />
          <div
            className="timeline-playhead"
            style={{ left: `${playhead}%` }}
            aria-hidden="true"
          />
          <div className="timeline-layer-tracks">
            {[...layers].reverse().map((layer, index) => (
              <button
                aria-label={`Intervalo de ${layer.name}`}
                className={`timeline-layer-bar${
                  layer.id === selectedId ? ' is-selected' : ''
                }`}
                key={layer.id}
                onClick={() => onSelect(layer.id)}
                onPointerDown={(event) => event.stopPropagation()}
                style={{
                  left: `${(layer.startTime / safeDuration) * 100}%`,
                  top: `${35 + index * 16}px`,
                  width: `${Math.max(
                    ((layer.endTime - layer.startTime) / safeDuration) * 100,
                    0.5,
                  )}%`,
                }}
                title={`${layer.name}: ${formatTime(layer.startTime)} – ${formatTime(
                  layer.endTime,
                )}`}
                type="button"
              >
                <span>{layer.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
