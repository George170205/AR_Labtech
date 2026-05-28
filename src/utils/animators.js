const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

/**
 * Registra un único callback en el Ticker de PixiJS que actualiza
 * todas las zonas animadas + el float de la escena completa.
 *
 * Un único Ticker.add() es más eficiente que N registros separados
 * porque PixiJS llama callbacks en serie y tiene overhead por registro.
 *
 * @param {Map}              sprites        { sprite, meta } por zoneId
 * @param {PIXI.Sprite}      contoursSprite  capa de contornos (no anima)
 * @param {PIXI.Ticker}      ticker
 * @returns {{ pause, resume, destroy }}
 */
export function setupAnimations(sprites, contoursSprite, ticker) {
    // Capturar transforms iniciales DESPUÉS del reveal (alpha=1, pos final)
    const initState = new Map();
    for (const [id, { sprite }] of sprites) {
        initState.set(id, {
            rotation: sprite.rotation,
            scaleX: sprite.scale.x,
            scaleY: sprite.scale.y,
            x: sprite.x,
            y: sprite.y,
        });
    }

    // Guardar posición Y del contenedor raíz para el float de escena
    const sceneRoot = contoursSprite.parent;
    const initRootY = sceneRoot?.y ?? 0;

    // Compilar lista de funciones de animación
    const animFns = [];

    for (const [, { sprite, meta }] of sprites) {
        if (!meta?.anim) continue;
        const init = initState.get(meta.id) ?? {};
        const fn = buildAnimFn(sprite, meta, init);
        if (fn) animFns.push(fn);
    }

    // Float global de toda la escena (sutil, período ~2.5s)
    if (sceneRoot) {
        animFns.push((t) => {
            sceneRoot.y = initRootY + Math.sin(t * 0.4 * TWO_PI) * 6;
        });
    }

    let paused = false;

    const tick = () => {
        if (paused) return;
        const t = performance.now() / 1000; // segundos desde epoch (absoluto)
        for (const fn of animFns) fn(t);
    };

    ticker.add(tick);

    return {
        pause() { paused = true; },
        resume() { paused = false; },
        destroy() { ticker.remove(tick); },
    };
}

// ─── Constructores de funciones de animación por tipo ──────────────────────────

function buildAnimFn(sprite, meta, init) {
    const { anim, amplitude: amp, speed, offset } = meta;

    switch (anim) {
        case 'swing':
        case 'walk':
            // Rotación sinusoidal alrededor del pivot.
            // 'walk' y 'swing' usan la misma función — el offset las diferencia.
            return (t) => {
                sprite.rotation =
                    init.rotation + Math.sin((t * speed + offset) * TWO_PI) * amp * DEG;
            };

        case 'breathe':
            // Escala Y oscila simétricamente desde el centro.
            // Escala X inversa leve (efecto volumen) para mayor realismo.
            return (t) => {
                const s = 1 + Math.sin((t * speed + offset) * TWO_PI) * amp;
                sprite.scale.set(init.scaleX * (1 - amp * 0.3 * Math.sin((t * speed + offset) * TWO_PI)), init.scaleY * s);
            };

        case 'float':
            // Traslación Y pura (dorsal, elementos no articulados)
            return (t) => {
                sprite.y = init.y + Math.sin((t * speed + offset) * TWO_PI) * amp;
            };

        case 'shimmer':
            // Alpha pulsante para manchas/detalles
            return (t) => {
                const pulse = (1 + Math.sin((t * speed + offset) * TWO_PI)) / 2; // 0-1
                sprite.alpha = 0.6 + pulse * 0.4;
            };

        default:
            return null;
    }
}