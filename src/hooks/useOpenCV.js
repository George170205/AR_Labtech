import { useState, useEffect } from 'react';

// Singleton: OpenCV.js se carga una sola vez en el ciclo de vida de la app.
// En desarrollo se carga desde CDN para evitar bloquear el hilo principal con
// una build local grande. No usamos COOP/COEP en Vite porque bloquea este CDN.
let cvPromise = null;

const OPENCV_URL = 'https://docs.opencv.org/4.8.0/opencv.js';

export function loadOpenCV() {
    if (cvPromise) return cvPromise;

    cvPromise = new Promise((resolve, reject) => {
        console.info(`[OpenCV] loading ${OPENCV_URL}; crossOriginIsolated=${window.crossOriginIsolated}`);

        const existing = document.querySelector('script[data-opencv-js]');
        if (existing) {
            waitForCV(resolve, reject);
            return;
        }

        if (window.cv?.Mat) {
            resolve(window.cv);
            return;
        }

        window.Module = {
            ...(window.Module ?? {}),
            onRuntimeInitialized() {
                waitForCV(resolve, reject);
            },
        };

        const script = document.createElement('script');
        script.dataset.opencvJs = 'true';
        script.src = OPENCV_URL;
        script.async = true;
        script.onload = () => waitForCV(resolve, reject);
        script.onerror = () => {
            cvPromise = null; // permitir reintento
            reject(new Error('No se pudo cargar OpenCV.js desde CDN'));
        };
        document.head.appendChild(script);
    });

    return cvPromise;
}

function waitForCV(resolve, reject) {
    const startedAt = performance.now();
    let thenAttached = false;

    const check = () => {
        const cv = window.cv;

        if (cv?.Mat) {
            console.info('[OpenCV] ready');
            resolveCV(resolve, cv);
            return;
        }

        if (!thenAttached && typeof cv?.then === 'function') {
            thenAttached = true;
            cv.then((readyCv) => {
                if (readyCv?.Mat) {
                    console.info('[OpenCV] ready from thenable');
                    resolveCV(resolve, readyCv);
                    return;
                }

                if (window.cv?.Mat) {
                    console.info('[OpenCV] ready from window.cv after thenable');
                    resolveCV(resolve, window.cv);
                    return;
                }

                window.setTimeout(check, 50);
            });
            window.setTimeout(check, 50);
            return;
        }

        if (performance.now() - startedAt > 20000) {
            cvPromise = null;
            reject(new Error('OpenCV.js tardó demasiado en inicializar'));
            return;
        }

        window.setTimeout(check, 50);
    };

    check();
}

function resolveCV(resolve, cv) {
    // OpenCV.js deja un .then en el objeto listo. Si resolvemos una Promise con
    // ese thenable, JS intenta adoptarlo y la Promise puede quedar colgada.
    try {
        Object.defineProperty(cv, 'then', {
            value: undefined,
            configurable: true,
        });
    } catch {
        // Si el descriptor no se puede redefinir, el fallback evita romper el flujo.
    }

    resolve(cv);
}

export function useOpenCV() {
    const [cv, setCv] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadOpenCV()
            .then((instance) => {
                setCv(instance);
                setIsLoading(false);
            })
            .catch((err) => {
                setError(err.message);
                setIsLoading(false);
            });
    }, []);

    return { cv, isLoading, error };
}
