import React, { useState, useEffect, useRef } from 'react';
import ZoneConfigPanel from './ZoneConfigPanel';
import { parseZoneCandidates } from '../utils/svgZoneParser';
import './SVGZoneConfigurator.css';

export default function SVGZoneConfigurator({ svgString, onSave, onCancel }) {
    const [candidates, setCandidates] = useState([]);
    const [zonesConfig, setZonesConfig] = useState(new Map());
    const [selectedId, setSelectedId] = useState(null);
    const [isPickingPivot, setIsPickingPivot] = useState(false);
    
    const svgContainerRef = useRef(null);

    useEffect(() => {
        parseZoneCandidates(svgString).then(cands => {
            setCandidates(cands);
            
            // Initialize config map
            const initialConfig = new Map();
            cands.forEach(c => {
                initialConfig.set(c.id, {
                    zoneId: c.suggestedName,
                    label: c.suggestedName,
                    anim: 'swing',
                    amplitude: 15,
                    speed: 1.0,
                    offset: 0,
                    isContours: c.suggestedName.toLowerCase().includes('contorno'),
                    pivotX: c.bbox.x + c.bbox.width / 2,
                    pivotY: c.bbox.y + c.bbox.height / 2
                });
            });
            setZonesConfig(initialConfig);
        });
    }, [svgString]);

    const handleSvgClick = (e) => {
        if (!svgContainerRef.current) return;
        
        // Find if we clicked on a candidate element
        let target = e.target;
        let candidate = null;
        
        while (target && target !== svgContainerRef.current) {
            candidate = candidates.find(c => {
                // In actual DOM, we would match by originalId or structural index,
                // but since we inject innerHTML, we can't directly compare object references.
                // For simplicity, let's assume the SVG elements have an id injected 
                // or we use originalId if available.
                return target.id === c.originalId;
            });
            if (candidate) break;
            target = target.parentNode;
        }

        if (isPickingPivot && selectedId) {
            const svgRect = svgContainerRef.current.getBoundingClientRect();
            // Need to map client coords to SVG viewBox coords
            // For now, assuming viewBox scale is 1:1 or we use relatively simple math.
            // A robust solution uses svgPoint.matrixTransform
            const svg = svgContainerRef.current.querySelector('svg');
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
            
            handleUpdateZone(selectedId, {
                ...zonesConfig.get(selectedId),
                pivotX: svgP.x,
                pivotY: svgP.y
            });
            setIsPickingPivot(false);
            return;
        }

        if (candidate) {
            setSelectedId(candidate.id);
        } else {
            // Unselect if clicking outside
            if (!isPickingPivot) setSelectedId(null);
        }
    };

    const handleUpdateZone = (id, newConfig) => {
        setZonesConfig(prev => {
            const next = new Map(prev);
            next.set(id, newConfig);
            return next;
        });
    };

    // To make elements clickable in dangerouslySetInnerHTML, we modify the SVG string
    const injectIdsToSvg = () => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        candidates.forEach(c => {
            if (c.originalId) {
                // It already has an ID
            } else {
                // If it doesn't have an ID, we could have injected one during parseZoneCandidates
                // But since we can't reliably match them without IDs, we must rely on original IDs
                // In a production app, svgZoneParser would inject IDs into the string it returns.
            }
        });
        // For MVP, we assume users have IDs (which Illustrator/Inkscape provides)
        return svgString; 
    };

    const selectedConfig = selectedId ? { id: selectedId, config: zonesConfig.get(selectedId) } : null;

    const handleSave = () => {
        onSave(zonesConfig);
    };

    const configuredCount = Array.from(zonesConfig.values()).filter(c => !c.isContours).length;

    return (
        <div className="szc-layout">
            <div className="szc-left">
                <div 
                    className={`szc-svg-container ${isPickingPivot ? 'picking-cursor' : ''}`}
                    ref={svgContainerRef}
                    onClick={handleSvgClick}
                    dangerouslySetInnerHTML={{ __html: injectIdsToSvg() }}
                />
                
                <div className="szc-status">
                    Zonas configuradas: {configuredCount}
                </div>
            </div>

            <div className="szc-right">
                <ZoneConfigPanel 
                    zone={selectedConfig}
                    onUpdate={handleUpdateZone}
                    onPickPivot={() => setIsPickingPivot(true)}
                    isPickingPivot={isPickingPivot}
                />

                <div className="szc-actions">
                    <button className="btn-cancel" onClick={onCancel}>Cancelar</button>
                    <button 
                        className="btn-save" 
                        onClick={handleSave}
                        disabled={configuredCount === 0}
                    >
                        Guardar Configuración
                    </button>
                </div>
            </div>
        </div>
    );
}
