import type { LayerPatch, MediaSource, WatermarkLayer } from '../editor-types'
import { Icon } from './Icons'

interface PropertiesPanelProps {
  media: MediaSource
  layers: WatermarkLayer[]
  selectedId: string | null
  onSelect: (id: string) => void
  onChange: (id: string, patch: LayerPatch) => void
  onDelete: (id: string) => void
  onReorder: (id: string, direction: -1 | 1) => void
}

const numberValue = (value: string, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const clamp = (value: number, minimum?: number, maximum?: number): number =>
  Math.min(maximum ?? Number.POSITIVE_INFINITY, Math.max(minimum ?? Number.NEGATIVE_INFINITY, value))

export function PropertiesPanel({
  media,
  layers,
  selectedId,
  onSelect,
  onChange,
  onDelete,
  onReorder,
}: Readonly<PropertiesPanelProps>) {
  const selected = layers.find((layer) => layer.id === selectedId)

  return (
    <aside className="properties-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Composición</span>
          <h2>Capas</h2>
        </div>
        <span className="layer-count">{layers.length}</span>
      </div>

      <div className="layer-list">
        {layers.length === 0 ? (
          <div className="layers-empty">
            <Icon name="layers" />
            <p>Añade una marca para empezar a componer.</p>
          </div>
        ) : (
          [...layers].reverse().map((layer) => {
            const actualIndex = layers.findIndex((item) => item.id === layer.id)
            return (
              <div
                className={`layer-row${layer.id === selectedId ? ' is-active' : ''}`}
                key={layer.id}
              >
                <button
                  className="layer-select"
                  onClick={() => onSelect(layer.id)}
                  type="button"
                >
                  <span className="layer-thumbnail">
                    <img alt="" src={layer.url} />
                  </span>
                  <span className="layer-meta">
                    <strong>{layer.name}</strong>
                    <small>
                      {Math.round(layer.width)} × {Math.round(layer.height)} px
                    </small>
                  </span>
                </button>
                <span className="layer-actions">
                  <button
                    aria-label={layer.visible ? 'Ocultar capa' : 'Mostrar capa'}
                    className="mini-action"
                    onClick={() => onChange(layer.id, { visible: !layer.visible })}
                    type="button"
                  >
                    <Icon name={layer.visible ? 'eye' : 'eyeOff'} />
                  </button>
                  <button
                    aria-label="Subir capa"
                    className="mini-action"
                    disabled={actualIndex === layers.length - 1}
                    onClick={() => onReorder(layer.id, 1)}
                    type="button"
                  >
                    <Icon name="chevronUp" />
                  </button>
                  <button
                    aria-label="Bajar capa"
                    className="mini-action"
                    disabled={actualIndex === 0}
                    onClick={() => onReorder(layer.id, -1)}
                    type="button"
                  >
                    <Icon name="chevronDown" />
                  </button>
                </span>
              </div>
            )
          })
        )}
      </div>

      {selected ? (
        <div className="properties-content">
          <div className="property-section">
            <h3>Posición y tamaño</h3>
            <div className="property-grid">
              <NumberField
                label="X"
                max={media.width}
                onChange={(x) => onChange(selected.id, { x })}
                suffix="px"
                value={selected.x}
              />
              <NumberField
                label="Y"
                max={media.height}
                onChange={(y) => onChange(selected.id, { y })}
                suffix="px"
                value={selected.y}
              />
              <NumberField
                label="Ancho"
                min={24}
                onChange={(width) =>
                  onChange(selected.id, {
                    width,
                    height: width / (selected.naturalWidth / selected.naturalHeight),
                  })
                }
                suffix="px"
                value={selected.width}
              />
              <NumberField
                label="Alto"
                min={24}
                onChange={(height) =>
                  onChange(selected.id, {
                    height,
                    width: height * (selected.naturalWidth / selected.naturalHeight),
                  })
                }
                suffix="px"
                value={selected.height}
              />
            </div>
          </div>

          <div className="property-section">
            <div className="property-label-row">
              <label htmlFor="rotation">Rotación</label>
              <output>{Math.round(selected.rotation)}°</output>
            </div>
            <input
              id="rotation"
              max="180"
              min="-180"
              onChange={(event) =>
                onChange(selected.id, { rotation: Number(event.target.value) })
              }
              type="range"
              value={selected.rotation}
            />
          </div>

          <div className="property-section">
            <div className="property-label-row">
              <label htmlFor="opacity">Opacidad</label>
              <output>{Math.round(selected.opacity * 100)}%</output>
            </div>
            <input
              id="opacity"
              max="100"
              min="0"
              onChange={(event) =>
                onChange(selected.id, {
                  opacity: Number(event.target.value) / 100,
                })
              }
              type="range"
              value={selected.opacity * 100}
            />
          </div>

          {media.kind === 'video' && (
            <div className="property-section">
              <h3>Intervalo visible</h3>
              <div className="property-grid">
                <NumberField
                  label="Inicio"
                  max={selected.endTime}
                  min={0}
                  onChange={(startTime) => onChange(selected.id, { startTime })}
                  step={0.1}
                  suffix="s"
                  value={selected.startTime}
                />
                <NumberField
                  label="Fin"
                  max={media.duration}
                  min={selected.startTime}
                  onChange={(endTime) => onChange(selected.id, { endTime })}
                  step={0.1}
                  suffix="s"
                  value={selected.endTime}
                />
              </div>
            </div>
          )}

          <button
            className="delete-button"
            onClick={() => onDelete(selected.id)}
            type="button"
          >
            <Icon name="trash" />
            Eliminar marca
          </button>
        </div>
      ) : (
        layers.length > 0 && (
          <p className="selection-hint">Selecciona una capa para ajustar sus propiedades.</p>
        )
      )}
    </aside>
  )
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  step = 1,
}: Readonly<{
  label: string
  value: number
  onChange: (value: number) => void
  suffix: string
  min?: number
  max?: number
  step?: number
}>) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <span className="number-input-wrap">
        <input
          max={max}
          min={min}
          onChange={(event) =>
            onChange(clamp(numberValue(event.target.value, value), min, max))
          }
          step={step}
          type="number"
          value={Number(value.toFixed(2))}
        />
        <small>{suffix}</small>
      </span>
    </label>
  )
}
