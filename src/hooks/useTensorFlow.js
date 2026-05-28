import { useState, useEffect } from 'react';

// Singleton: el backend WebGL se inicializa una sola vez.
// Importar @tensorflow/tfjs completo activa auto-detección de backend
// (WebGL > WASM > CPU) — no necesitamos seleccionar manualmente.
let tfPromise = null;

export function loadTensorFlow() {
    if (tfPromise) return tfPromise;
    tfPromise = import('@tensorflow/tfjs').then(async (tf) => {
        const isIOS =
            /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (isIOS) {
            await import('@tensorflow/tfjs-backend-cpu');
            await tf.setBackend('cpu');
        }
        await tf.ready(); // esperar inicialización del backend seleccionado
        console.info(`[TF.js] backend: ${tf.getBackend()}`);
        return tf;
    });
    return tfPromise;
}

export function useTensorFlow() {
    const [tf, setTf] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadTensorFlow()
            .then(setTf)
            .catch((err) => setError(err.message))
            .finally(() => setIsLoading(false));
    }, []);

    return { tf, isLoading, error };
}
