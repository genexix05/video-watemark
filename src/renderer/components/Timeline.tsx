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
  onSelect,
}: TimelineProps) {
  const safeDuration = Math.max(duration, 0.01)
  const playhead = (currentTime / safeDuration) * 100

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
        <span className="timeline-title">
          <Icon name="clock" />
          Línea de tiempo
        </span>
      </div>

      <div className="timeline-body">
        <div className="timeline-labels" aria-hidden="true">
          <span>0:00</span>
          <span>{formatTime(duration / 2).slice(0, 5)}</span>
          <span>{formatTime(duration).slice(0, 5)}</span>
        </div>
        <div className="timeline-track-area">
          <input
            aria-label="Posición de reproducción"
            className="timeline-seeker"
            max={safeDuration}
            min="0"
            onChange={(event) => onSeek(Number(event.target.value))}
            step="0.01"
            type="range"
            value={currentTime}
          />
          <div className="timeline-ruler" aria-hidden="true" />
          <div
            className="timeline-playhead"
            style={{ left: `${playhead}%` }}
            aria-hidden="true"
          />
          <div className="timeline-layer-tracks">
            {[...layers].reverse().map((layer) => (
              <button
                aria-label={`Intervalo de ${layer.name}`}
                className={`timeline-layer-bar${
                  layer.id === selectedId ? ' is-selected' : ''
                }`}
                key={layer.id}
                onClick={() => onSelect(layer.id)}
                style={{
                  left: `${(layer.startTime / safeDuration) * 100}%`,
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
