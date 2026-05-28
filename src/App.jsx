import { useState, useCallback, useRef } from 'react';
import CameraCapture from './components/CameraCapture.jsx';
import ColorAnalyzer from './components/ColorAnalyzer.jsx';
import AnimationScene from './components/AnimationScene.jsx';
import TemplateGallery from './components/TemplateGallery.jsx';
import OnboardingOverlay from './components/OnboardingOverlay.jsx';
import ShareModal from './components/ShareModal.jsx';
import TemplateUploadModal from './components/TemplateUploadModal.jsx';
import { validateSVG } from './utils/svgValidator.js';
import { useSoundFeedback } from './hooks/useSoundFeedback.js';
import { useTemplateStorage } from './hooks/useTemplateStorage.js';
import { useTemplateClassifier } from './hooks/useTemplateClassifier.js';

import dinosaurSvg from './templates/dinosaur.svg?raw';
import butterflySvg from './templates/butterfly.svg?raw';
import fishSvg from './templates/fish.svg?raw';
import birdSvg from './templates/bird.svg?raw';
import './App.css';

// Catálogo de templates — añadir aquí para extender la galería
const TEMPLATES = {
    dinosaurio: { label: 'Dinosaurio', svg: dinosaurSvg, icon: '🦕', zones: 7 },
    mariposa: { label: 'Mariposa', svg: butterflySvg, icon: '🦋', zones: 6 },
    pez: { label: 'Pez', svg: fishSvg, icon: '🐟', zones: 6 },
    pajaro: { label: 'Pájaro', svg: birdSvg, icon: '🐦', zones: 6 },
};

// Etiquetas del wizard para el indicador de progreso
const STEPS = [
    { icon: '🎨', label: 'Elige' },
    { icon: '📷', label: 'Escanea' },
    { icon: '✨', label: '¡Magia!' },
];

export default function App() {
    const [step, setStep] = useState(0);
    const [template, setTemplate] = useState('dinosaurio');
    const [capturedDataURL, setCaptured] = useState(null);
    const [zoneColorMap, setZoneColorMap] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState(null);
    const [showShare, setShowShare] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [frameDataURL, setFrameDataURL] = useState(null); // captura del canvas para compartir

    const pixiCanvasRef = useRef(null); // ref al canvas de PixiJS para grabar video
    const { play } = useSoundFeedback();
    const { templates: userTemplates, saveTemplate, deleteTemplate } = useTemplateStorage();
    const { addExamples, removeTemplate: removeKNNTemplate } = useTemplateClassifier();

    const allTemplates = { ...TEMPLATES };
    userTemplates.forEach(t => {
        allTemplates[t.id] = t;
    });

    const activeTemplate = allTemplates[template] || TEMPLATES.dinosaurio;
    const svgTemplate = activeTemplate.svg;
    const templateLabel = activeTemplate.label;

    // ── Paso 1 → 2: el niño capturó el papel ─────────────────────────────────
    const handleCaptured = useCallback((dataURL) => {
        play('capture');
        setCaptured(dataURL);
        setZoneColorMap(null);
        setAnalysisError(null);
        setAnalyzing(true);
        setStep(2); // ir directo al paso de animación
        // El análisis corre en el fondo — ColorAnalyzer se monta hidden
    }, [play]);

    // ── Análisis completo → animar ──────────────────────────────────────────
    const handleAnalysisComplete = useCallback((colorMap) => {
        play('success');
        setZoneColorMap(colorMap);
        setAnalyzing(false);
        setAnalysisError(null);
    }, [play]);

    const handleAnalysisError = useCallback((err) => {
        setAnalysisError(err.message ?? 'No se pudo analizar la imagen');
        setAnalyzing(false);
    }, []);

    // ── Guardar frame del canvas de PixiJS ─────────────────────────────────
    const handleSaveFrame = useCallback((dataURL) => {
        setFrameDataURL(dataURL);
        setShowShare(true);
        play('tap');
    }, [play]);

    // ── Volver al inicio ───────────────────────────────────────────────────
    const handleRestart = useCallback(() => {
        play('tap');
        setCaptured(null);
        setZoneColorMap(null);
        setAnalysisError(null);
        setAnalyzing(false);
        setStep(0);
    }, [play]);

    // ── Avanzar paso ──────────────────────────────────────────────────────
    const goTo = useCallback((s) => {
        play('step');
        setStep(s);
    }, [play]);

    return (
        <div className="app-root">

            {/* ── Onboarding (primera visita) ── */}
            <OnboardingOverlay
                forceOpen={showOnboarding}
                onClose={() => setShowOnboarding(false)}
            />

            {/* ── Share modal ── */}
            {showShare && (
                <ShareModal
                    imageDataURL={frameDataURL ?? capturedDataURL}
                    pixiCanvas={pixiCanvasRef.current}
                    templateLabel={templateLabel.toLowerCase()}
                    onClose={() => setShowShare(false)}
                />
            )}

            {/* ── Header ── */}
            <header className="app-header">
                <h1 className="app-brand">📖✨ Libro Vivo</h1>

                <button
                    className="app-help-btn"
                    onClick={() => setShowOnboarding(true)}
                    aria-label="Ayuda"
                >
                    ?
                </button>
            </header>

            {/* ── Progress bar ── */}
            <ProgressBar steps={STEPS} current={step} />

            {/* ════ PASO 0: Elige template ════ */}
            {step === 0 && (
                <div className="app-step">
                    <TemplateGallery
                        templates={allTemplates}
                        selected={template}
                        onSelect={(key) => { play('tap'); setTemplate(key); }}
                        onAddClick={() => setShowUploadModal(true)}
                        onDelete={(id) => {
                            deleteTemplate(id);
                            removeKNNTemplate(id);
                        }}
                    />

                    <div className="app-step-footer">
                        <BigButton
                            emoji="📷"
                            label="¡Ya lo colorié! Escanear"
                            onClick={() => goTo(1)}
                        />
                    </div>
                </div>
            )}

            {/* ════ PASO 1: Cámara ════ */}
            {step === 1 && (
                <div className="app-step">
                    <PrintGuide svgTemplate={svgTemplate} templateLabel={templateLabel} />

                    <CameraCapture onPaperCaptured={handleCaptured} />

                    <BackButton onClick={() => goTo(0)} />
                </div>
            )}

            {/* ════ PASO 2: Animación ════ */}
            {step === 2 && (
                <div className="app-step">
                    {/* ColorAnalyzer corre en background (hidden) cuando analyzing=true */}
                    {capturedDataURL && (
                        <div style={{ display: analyzing ? 'block' : 'none' }}>
                            <ColorAnalyzer
                                capturedDataURL={capturedDataURL}
                                svgTemplate={svgTemplate}
                                onAnalysisComplete={handleAnalysisComplete}
                                onAnalysisError={handleAnalysisError}
                            />
                        </div>
                    )}

                    {/* Mientras analiza: spinner amigable */}
                    {analyzing && (
                        <div className="app-analyzing">
                            <div className="app-spinner" />
                            <p className="app-analyzing-text">
                                🔍 Detectando tus colores…
                            </p>
                        </div>
                    )}

                    {analysisError && (
                        <div className="app-analysis-error">
                            <p>No pude detectar los colores: {analysisError}</p>
                            <BigButton
                                emoji="📷"
                                label="Intentar otra captura"
                                onClick={() => goTo(1)}
                                variant="secondary"
                            />
                        </div>
                    )}

                    {/* Cuando el análisis termina: mostrar animación */}
                    {!analyzing && !analysisError && zoneColorMap && (
                        <AnimationScene
                            key={template} // remount si cambia el template
                            zoneColorMap={zoneColorMap}
                            svgTemplate={svgTemplate}
                            onSave={handleSaveFrame}
                            canvasRef={pixiCanvasRef}
                            templateLabel={templateLabel}
                        />
                    )}

                    <div className="app-step-footer app-step-footer--row">
                        <BackButton onClick={handleRestart} label="🔄 Nuevo dibujo" />
                        {!analyzing && zoneColorMap && (
                            <BigButton
                                emoji="💾"
                                label="Guardar / Compartir"
                                onClick={() => {
                                    // Capturar frame actual del canvas de PixiJS
                                    const canvas = pixiCanvasRef.current;
                                    const dataURL = canvas?.toDataURL('image/png') ?? capturedDataURL;
                                    handleSaveFrame(dataURL);
                                }}
                                variant="secondary"
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Modal para subir plantilla */}
            {showUploadModal && (
                <TemplateUploadModal 
                    onClose={() => setShowUploadModal(false)}
                    onNext={async (data) => {
                        // Por ahora en Sprint 1, lo guardamos directamente sin paso 2
                        const newTemplate = {
                            label: data.name,
                            icon: data.icon,
                            svg: data.svgString,
                            zones: validateSVG(data.svgString).groupCount,
                            referenceImages: data.referenceImages
                        };
                        try {
                            const id = await saveTemplate(newTemplate);
                            if (data.referenceImages && data.referenceImages.length > 0) {
                                await addExamples(id, data.referenceImages);
                            }
                            setTemplate(id);
                            setShowUploadModal(false);
                        } catch (err) {
                            alert("Error al guardar: " + err.message);
                        }
                    }}
                />
            )}
        </div>
    );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function ProgressBar({ steps, current }) {
    return (
        <nav className="pb-root" aria-label="Progreso">
            {steps.map((s, i) => (
                <div key={i} className={`pb-step ${i === current ? 'pb-step--active' : ''} ${i < current ? 'pb-step--done' : ''}`}>
                    <div className="pb-bubble">
                        {i < current ? '✓' : s.icon}
                    </div>
                    <span className="pb-label">{s.label}</span>
                    {i < steps.length - 1 && <div className="pb-line" />}
                </div>
            ))}
        </nav>
    );
}

function PrintGuide({ svgTemplate, templateLabel }) {
    const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgTemplate)}`;
    return (
        <div className="pg-root">
            <p className="pg-text">
                Pon tu dibujo de <strong>{templateLabel}</strong> sobre una mesa
                con buena luz, bien plano y centrado frente a la cámara.
            </p>
            <a className="pg-download" href={href} download={`${templateLabel}.svg`}>
                🖨️ Descargar template para imprimir
            </a>
        </div>
    );
}

function BigButton({ emoji, label, onClick, variant = 'primary' }) {
    return (
        <button className={`app-big-btn app-big-btn--${variant}`} onClick={onClick}>
            <span className="app-big-btn-emoji">{emoji}</span>
            <span>{label}</span>
        </button>
    );
}

function BackButton({ onClick, label = '← Atrás' }) {
    return (
        <button className="app-back-btn" onClick={onClick}>
            {label}
        </button>
    );
}
