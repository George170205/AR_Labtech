import { useRef, useEffect, useCallback, useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import { useOpenCV } from '../hooks/useOpenCV';
import { detectPaperCorners, preloadPaperDetectorML, detectPaper } from '../utils/paperDetector';
import { warpPaper } from '../utils/perspectiveCorrector';
import { useTemplateClassifier } from '../hooks/useTemplateClassifier';
import './CameraCapture.css';

// Resolución máxima para procesamiento con OpenCV — no para display
const PROCESS_WIDTH = 640;
// Intervalo mínimo entre detecciones (ms) — equilibrio CV perf vs. responsividad
const DETECT_INTERVAL = 250;
// Histeresis: no perder el papel por 1-2 frames malos de OpenCV.
const MAX_MISSED_DETECTIONS = 6;
const CORNER_SMOOTHING = 0.35;

export default function CameraCapture({ onPaperCaptured }) {
    const { videoRef, isReady: camReady, error: camError } = useCamera();
    const { cv, isLoading: cvLoading, error: cvError } = useOpenCV();

    const liveCanvasRef = useRef(null); // preview en vivo (full width del contenedor)
    const overlayCanvasRef = useRef(null); // quad + corners superpuesto
    const warpedCanvasRef = useRef(null); // imagen rectificada
    const captureCanvasRef = useRef(null); // canvas offscreen persistente para CV
    const captureCtxRef = useRef(null); // contexto optimizado para lecturas frecuentes
    const manualCanvasRef = useRef(null);
    const manualImageRef = useRef(null);
    const draggedCornerRef = useRef(null);

    const rafRef = useRef(null);
    const lastDetectRef = useRef(0);
    const cornersRef = useRef(null); // últimas esquinas detectadas (coord. procesadas)
    const missedDetectionsRef = useRef(0);
    const scaleRef = useRef(1);    // factor de escala proceso→display

    const [status, setStatus] = useState('idle');
    // 'idle' | 'searching' | 'found' | 'locked'
    const [adjustment, setAdjustment] = useState(null);
    const [mlHint, setMlHint] = useState(false); // el modelo ML detectó papel pero OpenCV no pudo delimitar esquinas

    const { predict, isReady: classifierReady } = useTemplateClassifier();
    const [detectedTemplate, setDetectedTemplate] = useState(null);
    const lastPredictRef = useRef(0);

    // ─── ML Fallback refs ──────────────────────────────────────────────────────
    const mlCheckInProgressRef = useRef(false);  // evitar llamadas ML paralelas
    const mlDetectedRef = useRef(false);          // último resultado ML
    const lastMlCheckRef = useRef(0);             // timestamp del último chequeo ML

    // ─── Loop principal ────────────────────────────────────────────────────────

    const processFrame = useCallback(() => {
        const video = videoRef.current;
        const liveCanvas = liveCanvasRef.current;
        const overlayCanvas = overlayCanvasRef.current;
        const warpedCanvas = warpedCanvasRef.current;

        if (!video || !cv || !liveCanvas) {
            rafRef.current = requestAnimationFrame(processFrame);
            return;
        }

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) {
            rafRef.current = requestAnimationFrame(processFrame);
            return;
        }

        // Escalar para procesamiento
        const scale = Math.min(1, PROCESS_WIDTH / vw);
        scaleRef.current = scale;
        const pw = Math.round(vw * scale);
        const ph = Math.round(vh * scale);

        // Canvas de proceso persistente (evita alloc en cada frame)
        if (!captureCanvasRef.current) {
            captureCanvasRef.current = document.createElement('canvas');
            captureCtxRef.current = captureCanvasRef.current.getContext('2d', {
                willReadFrequently: true,
            });
        }
        const cap = captureCanvasRef.current;
        if (cap.width !== pw) cap.width = pw;
        if (cap.height !== ph) cap.height = ph;
        const capCtx = captureCtxRef.current;

        // Dibujar frame escalado al canvas de proceso
        capCtx.drawImage(video, 0, 0, pw, ph);

        // Dibujar frame original al live canvas (el display usa CSS para el tamaño)
        if (liveCanvas.width !== vw) liveCanvas.width = vw;
        if (liveCanvas.height !== vh) liveCanvas.height = vh;
        liveCanvas.getContext('2d').drawImage(video, 0, 0, vw, vh);

        // ── Detección throttled ─────────────────────────────────────────────────
        const now = performance.now();
        if (now - lastDetectRef.current >= DETECT_INTERVAL) {
            lastDetectRef.current = now;

            const imageData = capCtx.getImageData(0, 0, pw, ph);
            const mat = cv.matFromImageData(imageData);

            try {
                const corners = detectPaperCorners(cv, mat);

                if (corners) {
                    missedDetectionsRef.current = 0;
                    mlDetectedRef.current = false;  // OpenCV gana → limpiar flag ML
                    setMlHint(false);
                    cornersRef.current = smoothCorners(cornersRef.current, corners);
                    setStatus('found');

                    // Rectificar y mostrar
                    const warped = warpPaper(cv, mat, cornersRef.current);
                    cv.imshow(warpedCanvas, warped);
                    warped.delete();

                    // ML Prediction for template
                    if (classifierReady && now - lastPredictRef.current >= 500) {
                        lastPredictRef.current = now;
                        predict(warpedCanvas).then(result => {
                            if (result && result.confidence >= 0.75) {
                                setDetectedTemplate(result);
                            }
                        });
                    }
                } else {
                    missedDetectionsRef.current += 1;

                    if (missedDetectionsRef.current > MAX_MISSED_DETECTIONS) {
                        cornersRef.current = null;
                        setStatus((s) => (s === 'locked' ? s : 'searching'));

                        // ── Fallback ML: chequear si hay papel cuando OpenCV falla ──
                        // Solo intentar cada 800 ms para no saturar la CPU con inferencia
                        const videoEl = videoRef.current;
                        if (
                            videoEl &&
                            !mlCheckInProgressRef.current &&
                            now - lastMlCheckRef.current >= 800
                        ) {
                            lastMlCheckRef.current = now;
                            mlCheckInProgressRef.current = true;
                            detectPaper(cv, mat, videoEl).then(({ method }) => {
                                const detected = method === 'ml';
                                mlDetectedRef.current = detected;
                                setMlHint(detected);
                                mlCheckInProgressRef.current = false;
                            });
                        }
                    }
                }
            } finally {
                mat.delete();
            }
        }

        // Overlay siempre actualizado (coords de proceso → display)
        drawDetectionOverlay(overlayCanvas, cornersRef.current, vw, vh, 1 / scale);

        rafRef.current = requestAnimationFrame(processFrame);
    }, [cv, videoRef]);

    // Precarga el modelo ML en segundo plano al montar el componente
    useEffect(() => {
        preloadPaperDetectorML();
    }, []);

    useEffect(() => {
        if (!camReady || !cv || adjustment) return;
        setStatus('searching');
        rafRef.current = requestAnimationFrame(processFrame);
        return () => cancelAnimationFrame(rafRef.current);
    }, [camReady, cv, processFrame, adjustment]);

    useEffect(() => {
        if (!adjustment) return;

        const img = new Image();
        img.onload = () => {
            manualImageRef.current = img;
            drawManualAdjustment(manualCanvasRef.current, img, adjustment.corners);
        };
        img.src = adjustment.dataURL;
    }, [adjustment]);

    // ─── Acciones del usuario ──────────────────────────────────────────────────

    const handleCapture = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        setStatus('locked');

        if (cornersRef.current && warpedCanvasRef.current) {
            const dataURL = warpedCanvasRef.current.toDataURL('image/png');
            onPaperCaptured?.(dataURL, cornersRef.current);
            return;
        }

        const cap = captureCanvasRef.current;
        if (!cap) return;

        setAdjustment({
            dataURL: cap.toDataURL('image/png'),
            width: cap.width,
            height: cap.height,
            corners: getDefaultCorners(cap.width, cap.height),
        });
    }, [onPaperCaptured]);

    const handleManualAdjust = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        setStatus('locked');

        const cap = captureCanvasRef.current;
        if (!cap) return;

        setAdjustment({
            dataURL: cap.toDataURL('image/png'),
            width: cap.width,
            height: cap.height,
            corners: cornersRef.current ?? getDefaultCorners(cap.width, cap.height),
        });
    }, []);

    const handleRetry = useCallback(() => {
        cornersRef.current = null;
        missedDetectionsRef.current = 0;
        setAdjustment(null);
        setDetectedTemplate(null);
        setStatus('searching');
        rafRef.current = requestAnimationFrame(processFrame);
    }, [processFrame]);

    const handleManualPointerDown = useCallback((event) => {
        if (!adjustment) return;
        const point = getCanvasPoint(event, manualCanvasRef.current);
        draggedCornerRef.current = findNearestCorner(adjustment.corners, point, 60);
        event.currentTarget.setPointerCapture?.(event.pointerId);
    }, [adjustment]);

    const handleManualPointerMove = useCallback((event) => {
        const cornerIndex = draggedCornerRef.current;
        if (cornerIndex == null || !adjustment) return;

        const point = clampPoint(
            getCanvasPoint(event, manualCanvasRef.current),
            adjustment.width,
            adjustment.height,
        );

        setAdjustment((current) => {
            if (!current) return current;
            const corners = current.corners.map((corner, index) =>
                index === cornerIndex ? point : corner,
            );
            drawManualAdjustment(manualCanvasRef.current, manualImageRef.current, corners);
            return { ...current, corners };
        });
    }, [adjustment]);

    const handleManualPointerUp = useCallback((event) => {
        draggedCornerRef.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
    }, []);

    const handleConfirmManual = useCallback(async () => {
        if (!adjustment || !cv) return;

        const imageData = await dataURLToImageData(adjustment.dataURL);
        const mat = cv.matFromImageData(imageData);
        try {
            const warped = warpPaper(cv, mat, adjustment.corners);
            const outputCanvas = document.createElement('canvas');
            cv.imshow(outputCanvas, warped);
            const dataURL = outputCanvas.toDataURL('image/png');
            warped.delete();
            onPaperCaptured?.(dataURL, adjustment.corners);
        } finally {
            mat.delete();
        }
    }, [adjustment, cv, onPaperCaptured]);

    // ─── Render ────────────────────────────────────────────────────────────────

    const error = camError || cvError;
    const isLoading = cvLoading || !camReady;

    return (
        <div className="cc-root">
            {/* Video element oculto — solo fuente de frames */}
            <video ref={videoRef} className="cc-video-hidden" playsInline muted />

            {error && <ErrorScreen message={error} />}
            {isLoading && !error && <LoadingScreen cvLoading={cvLoading} />}

            {!isLoading && !error && adjustment && (
                <div className="cc-manual">
                    <h2 className="cc-section-title">Ajustar hoja</h2>
                    <p className="cc-manual-text">
                        Mueve los puntos a las cuatro esquinas del papel.
                    </p>
                    <canvas
                        ref={manualCanvasRef}
                        className="cc-manual-canvas"
                        onPointerDown={handleManualPointerDown}
                        onPointerMove={handleManualPointerMove}
                        onPointerUp={handleManualPointerUp}
                        onPointerCancel={handleManualPointerUp}
                    />
                    <div className="cc-controls">
                        <button className="cc-btn cc-btn--secondary" onClick={handleRetry}>
                            Repetir foto
                        </button>
                        <button className="cc-btn cc-btn--primary" onClick={handleConfirmManual}>
                            Usar recorte
                        </button>
                    </div>
                </div>
            )}

            {!isLoading && !error && !adjustment && (
                <>
            <div className="cc-layout">
                {/* ── Columna izquierda: cámara en vivo ── */}
                <section className="cc-section">
                    <h2 className="cc-section-title">Cámara en vivo</h2>
                    <div className="cc-camera-wrap">
                        <canvas ref={liveCanvasRef} className="cc-live" />
                        <canvas ref={overlayCanvasRef} className="cc-overlay" />
                        <StatusBadge status={status} />
                    </div>
                </section>

                {/* ── Columna derecha: papel rectificado ── */}
                <section className="cc-section">
                    <h2 className="cc-section-title">Papel detectado</h2>
                    <div className="cc-warped-wrap">
                        <canvas ref={warpedCanvasRef} className="cc-warped" />
                        {status === 'searching' && !mlHint && (
                            <div className="cc-no-paper">
                                <span>Apunta la cámara al dibujo</span>
                            </div>
                        )}
                        {status === 'searching' && mlHint && (
                            <div className="cc-no-paper cc-no-paper--ml">
                                <span>🧠 Papel detectado — acerca un poco más la cámara</span>
                            </div>
                        )}
                    </div>
                </section>
            </div>

            {/* ── Controles ── */}
            <div className="cc-controls">
                {status === 'locked' ? (
                    <button className="cc-btn cc-btn--secondary" onClick={handleRetry}>
                        Volver a escanear
                    </button>
                ) : (
                    <button
                        className="cc-btn cc-btn--primary"
                        onClick={handleCapture}
                    >
                        {status === 'found' ? '📸 Capturar dibujo' : '📷 Tomar foto y ajustar'}
                    </button>
                )}
                {status === 'found' && (
                    <button className="cc-btn cc-btn--secondary" onClick={handleManualAdjust}>
                        Ajustar esquinas
                    </button>
                )}
            </div>

            {/* Badge de detección automática */}
            {detectedTemplate && status === 'found' && (
                <div className="cc-ml-badge">
                    <span>🧠 Detectado: {detectedTemplate.templateId} ({Math.round(detectedTemplate.confidence * 100)}%)</span>
                </div>
            )}
                </>
            )}
        </div>
    );
}

function smoothCorners(previous, next) {
    if (!previous || previous.length !== next.length) return next;

    return next.map((corner, i) => ({
        x: previous[i].x * (1 - CORNER_SMOOTHING) + corner.x * CORNER_SMOOTHING,
        y: previous[i].y * (1 - CORNER_SMOOTHING) + corner.y * CORNER_SMOOTHING,
    }));
}

function getDefaultCorners(width, height) {
    const insetX = width * 0.08;
    const insetY = height * 0.08;

    return [
        { x: insetX, y: insetY },
        { x: width - insetX, y: insetY },
        { x: width - insetX, y: height - insetY },
        { x: insetX, y: height - insetY },
    ];
}

function drawManualAdjustment(canvas, img, corners) {
    if (!canvas || !img) return;

    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    ctx.fillStyle = 'rgba(0, 204, 102, 0.16)';
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = Math.max(3, width * 0.006);
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    corners.slice(1).forEach((corner) => ctx.lineTo(corner.x, corner.y));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    corners.forEach((corner, index) => {
        ctx.beginPath();
        ctx.fillStyle = index === 0 ? '#ff3366' : '#00ff88';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, width * 0.004);
        ctx.arc(corner.x, corner.y, Math.max(12, width * 0.025), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
}

function getCanvasPoint(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
}

function findNearestCorner(corners, point, maxDistance) {
    let nearest = null;
    let nearestDistance = maxDistance;

    corners.forEach((corner, index) => {
        const distance = Math.hypot(point.x - corner.x, point.y - corner.y);
        if (distance < nearestDistance) {
            nearest = index;
            nearestDistance = distance;
        }
    });

    return nearest;
}

function clampPoint(point, width, height) {
    return {
        x: Math.max(0, Math.min(width, point.x)),
        y: Math.max(0, Math.min(height, point.y)),
    };
}

function dataURLToImageData(dataURL) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
        };
        img.onerror = () => reject(new Error('No se pudo cargar la foto capturada'));
        img.src = dataURL;
    });
}

// ─── Sub-componentes ───────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    idle: { label: 'Iniciando…', color: '#888888' },
    searching: { label: 'Buscando papel…', color: '#FFA500' },
    found: { label: '¡Papel detectado!', color: '#00CC66' },
    locked: { label: '✓ Capturado', color: '#4488FF' },
};

function StatusBadge({ status }) {
    const { label, color } = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
    return (
        <div className="cc-status" style={{ '--status-color': color }}>
            {label}
        </div>
    );
}

function LoadingScreen({ cvLoading }) {
    return (
        <div className="cc-fullscreen">
            <div className="cc-spinner" />
            <p>{cvLoading ? 'Cargando motor de visión (~7MB)…' : 'Iniciando cámara…'}</p>
        </div>
    );
}

function ErrorScreen({ message }) {
    return (
        <div className="cc-fullscreen cc-error">
            <p>❌ {message}</p>
        </div>
    );
}

// ─── Utilidad de overlay ───────────────────────────────────────────────────────

/**
 * Dibuja el cuadrilátero detectado sobre el canvas overlay.
 * Los corners vienen en coordenadas del frame procesado (640px),
 * se escalan a las coordenadas del display con `upscale`.
 */
function drawDetectionOverlay(canvas, corners, displayW, displayH, upscale) {
    if (!canvas) return;
    if (canvas.width !== displayW) canvas.width = displayW;
    if (canvas.height !== displayH) canvas.height = displayH;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, displayW, displayH);

    if (!corners) return;

    const scaled = corners.map(({ x, y }) => ({ x: x * upscale, y: y * upscale }));

    // Polígono exterior
    ctx.strokeStyle = '#00FF88';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00FF88';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(scaled[0].x, scaled[0].y);
    scaled.forEach(({ x, y }) => ctx.lineTo(x, y));
    ctx.closePath();
    ctx.stroke();

    // Esquinas — TL en rojo como referencia de orientación
    scaled.forEach(({ x, y }, i) => {
        ctx.shadowBlur = 0;
        ctx.fillStyle = i === 0 ? '#FF3366' : '#00FF88';
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
    });
}
