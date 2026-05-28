import { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import { buildColoredSvgDataURL, buildPixiScene, PIXI_W, PIXI_H } from '../utils/sceneBuilder.js';
import { setupAnimations } from '../utils/animators.js';
import { burstCelebration, startSparkles } from '../utils/particleEffects.js';
import './AnimationScene.css';

export default function AnimationScene({ zoneColorMap, svgTemplate, onSave, canvasRef: externalRef, templateLabel = 'dibujo' }) {
    const internalRef = useRef(null);
    const canvasRef = externalRef ?? internalRef;
    const appRef = useRef(null);
    const sceneRef = useRef(null);
    const animRef = useRef(null);
    const sparkleRef = useRef(null);

    const [phase, setPhase] = useState('building');
    // 'building' | 'revealing' | 'alive' | 'paused' | 'error'
    const [error, setError] = useState(null);
    const [showFallback, setShowFallback] = useState(false);
    const coloredZones = countColoredZones(zoneColorMap);
    const totalZones = zoneColorMap?.size ?? 0;
    const fallbackImage = buildColoredSvgDataURL(svgTemplate, zoneColorMap);

    // ── Inicializar PixiJS y construir escena ──────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        const canvas = canvasRef.current;
        if (!canvas || !svgTemplate) return;

        const setup = async () => {
            // Esperar un tick para que el contexto WebGL anterior se libere completamente.
            // React StrictMode monta → destruye → monta de nuevo; Chrome Android
            // no libera el slot WebGL de forma síncrona, así que el segundo intento falla.
            await new Promise((resolve) => setTimeout(resolve, 120));
            if (cancelled) return;

            let app;
            try {
                app = new PIXI.Application({
                    view: canvas,
                    width: PIXI_W,
                    height: PIXI_H,
                    backgroundColor: 0x1a1a2e,
                    backgroundAlpha: 0,
                    antialias: true,
                    preserveDrawingBuffer: true,
                    resolution: Math.min(window.devicePixelRatio || 1, 2),
                    autoDensity: true,
                });
            } catch (_err) {
                // WebGL falló — intentar con Canvas 2D como fallback
                try {
                    app = new PIXI.Application({
                        view: canvas,
                        width: PIXI_W,
                        height: PIXI_H,
                        backgroundColor: 0x1a1a2e,
                        backgroundAlpha: 0,
                        antialias: false,
                        preserveDrawingBuffer: true,
                        resolution: 1,
                        autoDensity: true,
                        forceCanvas: true,
                    });
                } catch (err2) {
                    if (!cancelled) {
                        console.error('[PixiJS] No se pudo crear el renderer (WebGL ni Canvas):', err2);
                        setError('No se pudo iniciar la animación. Intenta recargar la página.');
                        setPhase('error');
                    }
                    return;
                }
            }

            if (cancelled) {
                app.destroy(false, { children: true, texture: true, baseTexture: true });
                return;
            }

            appRef.current = app;

            buildPixiScene(app, svgTemplate, zoneColorMap)
                .then((scene) => {
                    if (cancelled) return;
                    sceneRef.current = scene;
                    setPhase('revealing');
                    return runReveal(app, scene);
                })
                .then(() => {
                    if (cancelled) return;
                    setPhase('alive');
                })
                .catch((err) => {
                    if (cancelled) return;
                    console.error('[AnimationScene]', err);
                    setError(err.message ?? 'Error al construir la escena');
                    setPhase('error');
                });
        };

        setup();

        return () => {
            cancelled = true;
            animRef.current?.destroy();
            sparkleRef.current?.stop();
            sparkleRef.current = null;

            if (appRef.current) {
                // Forzar liberación del contexto WebGL para que el siguiente mount pueda adquirirlo.
                // Sin esto, Chrome Android puede negar el nuevo contexto si el anterior no se liberó.
                try {
                    const gl =
                        canvas.getContext('webgl2') ??
                        canvas.getContext('webgl') ??
                        canvas.getContext('experimental-webgl');
                    gl?.getExtension('WEBGL_lose_context')?.loseContext();
                } catch (_) { /* ignorar si el canvas ya no existe */ }

                appRef.current.destroy(false, { children: true, texture: true, baseTexture: true });
                appRef.current = null;
            }

            sceneRef.current = null;
        };
    }, [svgTemplate, zoneColorMap]);

    useEffect(() => {
        if (phase !== 'alive') return;

        const timeout = window.setTimeout(() => {
            if (canvasLooksBlank(canvasRef.current)) {
                setShowFallback(true);
            }
        }, 800);

        return () => window.clearTimeout(timeout);
    }, [phase, canvasRef]);

    // ── Lanzar animaciones al pasar a 'alive' ─────────────────────────────────
    useEffect(() => {
        if (phase !== 'alive') return;
        const scene = sceneRef.current;
        const app = appRef.current;
        if (!scene || !app) return;

        const { sprites, contoursSprite, root, svgW, svgH } = scene;

        // Loop de animaciones articuladas
        animRef.current = setupAnimations(sprites, contoursSprite, app.ticker);

        // Burst de celebración con colores detectados
        const hexColors = [...(zoneColorMap?.values() ?? [])]
            .filter((z) => z?.status === 'colored' && z.rgb)
            .map(({ rgb: [r, g, b] }) => (r << 16) | (g << 8) | b);
        burstCelebration(app, root, svgW / 2, svgH / 2, hexColors);

        // Chispas continuas
        sparkleRef.current = startSparkles(app, root, svgW, svgH);
    }, [phase, zoneColorMap]);

    // ── Controles ─────────────────────────────────────────────────────────────
    const handleToggle = useCallback(() => {
        if (phase === 'alive') {
            animRef.current?.pause();
            sparkleRef.current?.stop();
            sparkleRef.current = null;
            setPhase('paused');
        } else if (phase === 'paused') {
            animRef.current?.resume();
            const { root, svgW, svgH } = sceneRef.current;
            sparkleRef.current = startSparkles(appRef.current, root, svgW, svgH);
            setPhase('alive');
        }
    }, [phase]);

    const handleSave = useCallback(() => {
        const dataURL = canvasRef.current?.toDataURL('image/png');
        if (!dataURL) return;
        onSave?.(dataURL);
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = `${templateLabel.toLowerCase().replace(/\s+/g, '-')}-cobra-vida.png`;
        a.click();
    }, [onSave, templateLabel, canvasRef]);

    const isControllable = phase === 'alive' || phase === 'paused';

    return (
        <div className="as-root">
            {/* Canvas de PixiJS — CSS lo escala al contenedor */}
            <canvas ref={canvasRef} className="as-canvas" />

            <img
                className={`as-fallback-img ${showFallback ? 'as-fallback-img--active' : ''}`}
                src={fallbackImage}
                alt="Dibujo coloreado"
            />

            <div className="as-debug">
                {phase} · {coloredZones}/{totalZones} zonas
            </div>

            {/* Overlay de carga */}
            {phase === 'building' && (
                <div className="as-overlay">
                    <div className="as-spinner" />
                    <p>Preparando animación…</p>
                </div>
            )}

            {/* Texto de reveal */}
            {phase === 'revealing' && (
                <div className="as-overlay as-overlay--transparent">
                    <p className="as-reveal-text">✨ ¡Tu dibujo cobra vida!</p>
                </div>
            )}

            {/* Error */}
            {phase === 'error' && (
                <div className="as-overlay as-overlay--error">
                    <p>❌ {error}</p>
                </div>
            )}

            {/* Controles — sólo cuando la animación está en marcha o pausada */}
            {isControllable && (
                <div className="as-controls">
                    <button className="as-btn" onClick={handleToggle}>
                        {phase === 'alive' ? '⏸ Pausar' : '▶ Continuar'}
                    </button>
                    <button className="as-btn as-btn--save" onClick={handleSave}>
                        💾 Guardar
                    </button>
                </div>
            )}
        </div>
    );
}

function countColoredZones(zoneColorMap) {
    if (!zoneColorMap) return 0;
    let count = 0;
    for (const zone of zoneColorMap.values()) {
        if (zone?.status === 'colored') count++;
    }
    return count;
}

function canvasLooksBlank(canvas) {
    if (!canvas?.width || !canvas?.height) return true;

    try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const { width, height } = canvas;
        const sample = ctx.getImageData(0, 0, width, height).data;
        let brightPixels = 0;
        const step = Math.max(4, Math.floor(sample.length / 4000));

        for (let i = 0; i < sample.length; i += step * 4) {
            const r = sample[i];
            const g = sample[i + 1];
            const b = sample[i + 2];
            if (r + g + b > 90) brightPixels += 1;
        }

        return brightPixels < 8;
    } catch {
        return false;
    }
}

// ─── Secuencia de reveal ───────────────────────────────────────────────────────

async function runReveal(app, scene) {
    const { sprites, contoursSprite } = scene;

    for (const { sprite } of sprites.values()) {
        await fadeIn(sprite, 260, app.ticker);
        await wait(220);
    }

    // Contornos aparecen al final (todo el dibujo visible)
    await fadeIn(contoursSprite, 450, app.ticker);
}

function wait(ms) {
    return new Promise((res) => setTimeout(res, ms));
}

/**
 * Fade-in de un sprite en `durationMs` ms.
 * Usa ease-out cúbico para que la aparición se sienta suave y no abrupta.
 */
function fadeIn(sprite, durationMs, ticker) {
    sprite.alpha = 0;
    const t0 = performance.now();

    return new Promise((resolve) => {
        const tick = () => {
            const progress = Math.min((performance.now() - t0) / durationMs, 1);
            // Ease out cubic: f(t) = 1 - (1-t)³
            sprite.alpha = 1 - Math.pow(1 - progress, 3);

            if (progress >= 1) {
                sprite.alpha = 1;
                ticker.remove(tick);
                resolve();
            }
        };
        ticker.add(tick);
    });
}
