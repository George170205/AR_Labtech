import React from 'react';
import './ZoneConfigPanel.css';

export default function ZoneConfigPanel({ zone, onUpdate, onPickPivot, isPickingPivot }) {
    if (!zone) {
        return (
            <div className="zcp-empty">
                <p>Selecciona una zona en el SVG para configurarla.</p>
            </div>
        );
    }

    const handleChange = (field, value) => {
        onUpdate(zone.id, { ...zone.config, [field]: value });
    };

    return (
        <div className="zcp-root">
            <h3>Configurar Zona</h3>
            
            <div className="form-group">
                <label>ID de Zona (interno)</label>
                <input 
                    type="text" 
                    value={zone.config.zoneId || ''} 
                    onChange={e => handleChange('zoneId', e.target.value.replace(/\s+/g, '_').toLowerCase())} 
                />
            </div>

            <div className="form-group">
                <label>Nombre legible</label>
                <input 
                    type="text" 
                    value={zone.config.label || ''} 
                    onChange={e => handleChange('label', e.target.value)} 
                />
            </div>

            <div className="form-group checkbox-group">
                <label>
                    <input 
                        type="checkbox" 
                        checked={zone.config.isContours || false}
                        onChange={e => handleChange('isContours', e.target.checked)}
                    />
                    Es la capa de contornos
                </label>
            </div>

            {!zone.config.isContours && (
                <>
                    <div className="form-group">
                        <label>Tipo de animación</label>
                        <select 
                            value={zone.config.anim || 'swing'} 
                            onChange={e => handleChange('anim', e.target.value)}
                        >
                            <option value="swing">Swing (Rotación pendular)</option>
                            <option value="breathe">Breathe (Escala vertical)</option>
                            <option value="float">Float (Flotación vertical)</option>
                            <option value="walk">Walk (Rotación alternada)</option>
                            <option value="shimmer">Shimmer (Parpadeo)</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <button 
                            className={`btn-pivot ${isPickingPivot ? 'picking' : ''}`}
                            onClick={onPickPivot}
                        >
                            📍 {isPickingPivot ? 'Haz clic en el SVG...' : 'Fijar punto de pivote'}
                        </button>
                        <div className="pivot-coords">
                            Actual: x={Math.round(zone.config.pivotX || 0)}, y={Math.round(zone.config.pivotY || 0)}
                        </div>
                    </div>

                    <div className="form-group range-group">
                        <label>Amplitud: {zone.config.amplitude || 0}</label>
                        <input 
                            type="range" 
                            min="-90" max="90" step="1"
                            value={zone.config.amplitude || 0} 
                            onChange={e => handleChange('amplitude', parseFloat(e.target.value))} 
                        />
                    </div>

                    <div className="form-group range-group">
                        <label>Velocidad: {zone.config.speed || 1} Hz</label>
                        <input 
                            type="range" 
                            min="0.1" max="5.0" step="0.1"
                            value={zone.config.speed || 1} 
                            onChange={e => handleChange('speed', parseFloat(e.target.value))} 
                        />
                    </div>

                    <div className="form-group range-group">
                        <label>Offset: {zone.config.offset || 0} rad</label>
                        <input 
                            type="range" 
                            min="0" max="6.28" step="0.1"
                            value={zone.config.offset || 0} 
                            onChange={e => handleChange('offset', parseFloat(e.target.value))} 
                        />
                    </div>
                </>
            )}
        </div>
    );
}
