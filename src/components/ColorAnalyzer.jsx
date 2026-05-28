import { useState, useEffect, useCallback, useRef } from 'react';
import { useTensorFlow } from '../hooks/useTensorFlow.js';
import { analyzeColors } from '../utils/colorAnalyzer.js';
import ZoneColorCard from './ZoneColorCard.jsx';
import './ColorAnalyzer.css';

export default function ColorAnalyzer({ capturedDataURL, svgTemplate, onAnalysisComplete, onAnalysisError }) {
    const { tf, isLoading: tfLoading, error: tfError } = useTensorFlow();

    const [zoneMap, setZoneMap] = useState(null);
    const [progress, setProgress] = useState(null); // { step, total, label }
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [illumination, setIllumination] = useState('whitePaper');

    const runRef = useRef(0); // evita actualizaciones stale de renders concurrentes

    const runAnalysis = useCallback(async () => {
        if (!tf || !capturedDataURL || !svgTemplate) return;

        const run = ++runRef.current;
        setIsProcessing(true);
        setError(null);
        setZoneMap(null);

        try {
            const result = await analyzeColors(
                tf,
                capturedDataURL,
                svgTemplate,
                {
                    illuminationMethod: illumination,
                    onProgress: (step, total, label) => {
                        if (runRef.current !== run) return;
                        setProgress({ step, total, label });
                    },
                },
            );

            if (runRef.current !== run) return;
            setZoneMap(result);
            onAnalysisComplete?.(result);
        } catch (err) {
            if (runRef.current !== run) return;
            setError(err.message);
            onAnalysisError?.(err);
        } finally {
            if (runRef.current === run) {
                setIsProcessing(false);
                setProgress(null);
            }
        }
    }, [tf, capturedDataURL, svgTemplate, illumination, onAnalysisComplete, onAnalysisError]);

    // Lanzar análisis automáticamente cuando llega la imagen
    useEffect(() => {
        if (tf && capturedDataURL) runAnalysis();
    }, [tf, capturedDataURL, runAnalysis]);

    // ─── Render ───────────────────────────────────────────────────────────────

    if (tfError) return <ErrorBanner msg={`TensorFlow.js: ${tfError}`} />;
    if (tfLoading) return <StatusMsg text="Cargando motor ML…" />;

    if (!capturedDataURL) {
        return <StatusMsg text="Esperando captura de la Fase 1…" />;
    }

    return (
        <div className="ca-root">
            <header className="ca-header">
                <h2 className="ca-title">Análisis de colores</h2>

                {/* Selector de método de corrección de iluminación */}
                <div className="ca-method">
                    <label>Corrección de luz:</label>
                    <select
                        value={illumination}
                        onChange={(e) => setIllumination(e.target.value)}
                        disabled={isProcessing}
                    >
                        <option value="whitePaper">Borde del papel (recomendado)</option>
                        <option value="grayWorld">Gray World</option>
                        <option value="whiteStretch">White Stretch</option>
                    </select>
                    <button
                        className="ca-btn"
                        onClick={runAnalysis}
                        disabled={isProcessing}
                    >
                        {isProcessing ? '⏳' : '🔄'} Reanalizar
                    </button>
                </div>
            </header>

            {/* Barra de progreso */}
            {isProcessing && progress && (
                <div className="ca-progress">
                    <div
                        className="ca-progress-bar"
                        style={{ width: `${(progress.step / progress.total) * 100}%` }}
                    />
                    <span className="ca-progress-label">{progress.label}</span>
                </div>
            )}

            {error && <ErrorBanner msg={error} />}

            {/* Previsualización de la imagen corregida */}
            {capturedDataURL && (
                <div className="ca-preview">
                    <img src={capturedDataURL} alt="Captura rectificada" className="ca-preview-img" />
                </div>
            )}

            {/* Grid de zonas */}
            {zoneMap && (
                <>
                    <p className="ca-summary">
                        {countColored(zoneMap)} de {zoneMap.size} zonas coloreadas
                    </p>
                    <div className="ca-grid">
                        {[...zoneMap.entries()].map(([zoneId, result]) => (
                            <ZoneColorCard key={zoneId} zoneId={zoneId} result={result} />
                        ))}
                    </div>

                    {/* Output JSON para debug / Fase 3 */}
                    <details className="ca-debug">
                        <summary>Ver ZoneColorMap (para Fase 3)</summary>
                        <pre>{serializeZoneMap(zoneMap)}</pre>
                    </details>
                </>
            )}
        </div>
    );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function countColored(map) {
    let n = 0;
    for (const v of map.values()) if (v.status === 'colored') n++;
    return n;
}

function serializeZoneMap(map) {
    const obj = {};
    for (const [k, v] of map) {
        obj[k] = {
            name: v.name,
            hex: v.hex,
            rawHex: v.rawHex,
            rgb: v.rgb,
            confidence: v.confidence,
            deltaE: v.deltaE?.toFixed(2),
        };
    }
    return JSON.stringify(obj, null, 2);
}

function StatusMsg({ text }) {
    return <div className="ca-status-msg">{text}</div>;
}

function ErrorBanner({ msg }) {
    return <div className="ca-error">❌ {msg}</div>;
}
