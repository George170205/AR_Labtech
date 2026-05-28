/**
 * Síntesis de audio en tiempo real con Web Audio API.
 * Sin dependencias externas. Los sonidos se generan como osciladores
 * con envolventes ADSR — no hay archivos de audio que descargar.
 *
 * Restricción de navegadores: AudioContext requiere un gesto del usuario
 * (tap/click) para inicializarse. El lazy init en `getCtx()` garantiza
 * que el contexto sólo se crea cuando el usuario ya ha interactuado.
 */

let _ctx = null;

function getCtx() {
    if (!_ctx) {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // iOS Safari suspende el contexto al cambiar de app — resumir siempre
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
}

/**
 * Reproduce un tono sintético.
 *
 * @param {number}  freq    Frecuencia Hz
 * @param {number}  dur     Duración segundos
 * @param {string}  type    Tipo de oscilador (sine|square|sawtooth|triangle)
 * @param {number}  vol     Volumen pico 0-1
 * @param {number}  delay   Retardo desde ahora en segundos
 */
function tone(freq, dur, type = 'sine', vol = 0.25, delay = 0) {
    try {
        const ac = getCtx();
        const t0 = ac.currentTime + delay;

        const osc = ac.createOscillator();
        const gain = ac.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);

        // Envolvente: ataque rápido → sustain breve → caída exponencial
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
        gain.gain.setValueAtTime(vol, t0 + dur * 0.25);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(gain);
        gain.connect(ac.destination);

        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
    } catch {
        // Audio bloqueado (política de autoplay) — fallar silenciosamente
    }
}

// ─── Paleta de sonidos ─────────────────────────────────────────────────────────

export const sounds = {
    /** Click táctil suave — cualquier acción de UI */
    tap() {
        tone(440, 0.08, 'sine', 0.18);
    },

    /** Sonido de cámara — captura de papel */
    capture() {
        tone(880, 0.06, 'sine', 0.28);
        tone(1320, 0.10, 'sine', 0.22, 0.07);
    },

    /** Éxito — zona detectada correctamente */
    success() {
        const notes = [523, 659, 784, 1047]; // Do Mi Sol Do (octava)
        notes.forEach((f, i) => tone(f, 0.18, 'triangle', 0.25, i * 0.09));
    },

    /** Error amigable — papel no detectado, etc. */
    error() {
        tone(350, 0.14, 'sawtooth', 0.18);
        tone(280, 0.18, 'sawtooth', 0.14, 0.13);
    },

    /** Celebración — dinosaurio cobra vida */
    celebrate() {
        // Arpegio ascendente con armónico
        const melody = [523, 659, 784, 1047, 1319];
        melody.forEach((f, i) => {
            tone(f, 0.16, 'triangle', 0.28, i * 0.085);
            tone(f * 1.5, 0.14, 'sine', 0.10, i * 0.085); // armónico
        });
    },

    /** Glissando de chispas — reveal de zona */
    sparkle() {
        for (let i = 0; i < 5; i++) {
            const f = 1200 + Math.random() * 1800;
            tone(f, 0.12, 'sine', 0.12, i * 0.06);
        }
    },

    /** Paso avanzado en el wizard */
    step() {
        tone(660, 0.10, 'sine', 0.20);
        tone(880, 0.12, 'sine', 0.18, 0.08);
    },
};

// ─── Hook de React ──────────────────────────────────────────────────────────────

import { useCallback, useRef } from 'react';

/**
 * Retorna un objeto `play` con todos los sonidos disponibles,
 * respetando la preferencia del sistema `prefers-reduced-motion`
 * (si el usuario desactiva animaciones, también silenciamos el audio).
 */
export function useSoundFeedback() {
    const enabledRef = useRef(
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );

    const play = useCallback((name) => {
        if (!enabledRef.current) return;
        sounds[name]?.();
    }, []);

    const toggle = useCallback(() => {
        enabledRef.current = !enabledRef.current;
        return enabledRef.current;
    }, []);

    return { play, toggle, enabled: enabledRef };
}