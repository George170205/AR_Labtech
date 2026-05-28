import { useState } from 'react';
import './TemplateGallery.css';

/**
 * Galería de templates con:
 *   - Vista previa inline del SVG (dangerouslySetInnerHTML es seguro aquí
 *     porque todos los SVGs son assets propios del bundle, nunca input de usuario)
 *   - Enlace de descarga (para que el niño imprima y coloree)
 *   - Selección del template activo
 *
 * @param {{ templates, selected, onSelect, onAddClick, onDelete }} props
 *   templates: { [key]: { label, svg, icon, zones, isBuiltIn } }
 *   selected:  key del template activo
 *   onSelect:  (key) => void
 *   onAddClick: () => void
 *   onDelete: (key) => void
 */
export default function TemplateGallery({ templates, selected, onSelect, onAddClick, onDelete }) {
    const [previewing, setPreviewing] = useState(null);

    return (
        <div className="tg-root">
            <h2 className="tg-title">Elige tu dibujo</h2>
            <p className="tg-subtitle">
                Pulsa uno para seleccionarlo, luego descárgalo e imprímelo.
            </p>

            <div className="tg-grid">
                {Object.entries(templates).map(([key, tpl]) => (
                    <TemplateCard
                        key={key}
                        id={key}
                        template={tpl}
                        isSelected={selected === key}
                        isPreviewing={previewing === key}
                        onSelect={() => onSelect(key)}
                        onPreview={() => setPreviewing(previewing === key ? null : key)}
                    />
                ))}
                
                {onAddClick && (
                    <div className="tg-card tg-card--add" onClick={onAddClick}>
                        <div className="tg-thumb-btn">
                            <span className="tg-icon tg-icon-add">➕</span>
                        </div>
                        <div className="tg-card-footer">
                            <span className="tg-card-label">Agregar mi propia plantilla</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function TemplateCard({ id, template, isSelected, isPreviewing, onSelect, onPreview, onDelete }) {
    const { label, svg, icon, zones, isBuiltIn = true } = template;

    // SVG → data URL para descarga
    const downloadHref = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

    return (
        <div className={`tg-card ${isSelected ? 'tg-card--selected' : ''}`}>
            {/* Thumbnail del SVG — click para preview ampliado */}
            <button className="tg-thumb-btn" onClick={onPreview} aria-label={`Ver ${label}`}>
                <div
                    className="tg-thumb"
                    dangerouslySetInnerHTML={{ __html: svg }}
                />
                {icon && <span className="tg-icon">{icon}</span>}
            </button>

            {/* Preview ampliado (toggle) */}
            {isPreviewing && (
                <div className="tg-preview-expanded">
                    <div
                        className="tg-preview-svg"
                        dangerouslySetInnerHTML={{ __html: svg }}
                    />
                </div>
            )}

            <div className="tg-card-footer">
                <div className="tg-card-info">
                    <span className="tg-card-label">{label}</span>
                    <span className="tg-card-zones">{zones} zonas de color</span>
                </div>

                <div className="tg-card-actions">
                    {/* Descargar para imprimir */}
                    <a
                        className="tg-btn tg-btn--download"
                        href={downloadHref}
                        download={`${id}.svg`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Descargar ${label}`}
                    >
                        🖨️
                    </a>

                    {/* Eliminar (solo para usuarios) */}
                    {!isBuiltIn && onDelete && (
                        <button
                            className="tg-btn tg-btn--delete"
                            onClick={(e) => { e.stopPropagation(); onDelete(id); }}
                            aria-label={`Eliminar ${label}`}
                        >
                            🗑️
                        </button>
                    )}

                    {/* Seleccionar */}
                    <button
                        className={`tg-btn tg-btn--select ${isSelected ? 'tg-btn--active' : ''}`}
                        onClick={onSelect}
                    >
                        {isSelected ? '✓ Elegido' : 'Elegir'}
                    </button>
                </div>
            </div>
        </div>
    );
}