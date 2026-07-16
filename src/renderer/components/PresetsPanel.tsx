import type { PresetSummary } from '../../shared/api'

export function PresetsPanel({
  presets,
  disabled,
  canSave,
  onSave,
  onApply,
  onDelete,
}: Readonly<{
  presets: PresetSummary[]
  disabled: boolean
  canSave: boolean
  onSave: () => void
  onApply: (id: string) => void
  onDelete: (id: string) => void
}>) {
  return (
    <section className="presets-panel">
      <div className="panel-heading compact">
        <h2>Presets</h2>
        <button
          className="mini-button"
          disabled={disabled || !canSave}
          onClick={onSave}
          type="button"
        >
          Guardar
        </button>
      </div>
      <div className="preset-list">
        {presets.length === 0 ? (
          <p className="selection-hint">Guarda una composición para reutilizarla.</p>
        ) : (
          presets.map((preset) => (
            <div className="preset-row" key={preset.id}>
              <button
                className="preset-apply"
                disabled={disabled}
                onClick={() => onApply(preset.id)}
                type="button"
              >
                <strong>{preset.name}</strong>
                <small>{preset.layerCount} capa{preset.layerCount === 1 ? '' : 's'}</small>
              </button>
              <button
                aria-label={`Eliminar preset ${preset.name}`}
                className="mini-action"
                disabled={disabled}
                onClick={() => onDelete(preset.id)}
                type="button"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
