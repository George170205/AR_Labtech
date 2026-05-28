import { useRef, useState, useCallback, useEffect } from 'react';

// En móvil: facingMode 'environment' = cámara trasera (mejor calidad para captura)
// width/height: ideales, el navegador elige la resolución más cercana soportada
const VIDEO_CONSTRAINTS = {
    video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
    },
};

export function useCamera() {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    const start = useCallback(async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
            streamRef.current = stream;

            const video = videoRef.current;
            if (!video) return;

            video.srcObject = stream;
            await new Promise((resolve) => {
                if (video.videoWidth > 0) {
                    resolve();
                    return;
                }

                const handleReady = () => {
                    if (video.videoWidth > 0) resolve();
                };

                video.onloadedmetadata = handleReady;
                video.onloadeddata = handleReady;
            });
            await video.play();

            setDimensions({ width: video.videoWidth, height: video.videoHeight });
            setIsReady(true);
        } catch (err) {
            setError(parseMediaError(err));
        }
    }, []);

    const stop = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
        streamRef.current = null;
        setIsReady(false);
    }, []);

    useEffect(() => {
        start();
        return stop;
    }, [start, stop]);

    return { videoRef, isReady, error, dimensions, restart: start };
}

function parseMediaError(err) {
    const messages = {
        NotAllowedError: 'Permiso de cámara denegado. Habilítalo en la configuración del navegador.',
        NotFoundError: 'No se encontró ninguna cámara en este dispositivo.',
        NotReadableError: 'La cámara está siendo usada por otra aplicación.',
        OverconstrainedError: 'La cámara no soporta la resolución solicitada.',
    };
    return messages[err.name] ?? `Error de cámara: ${err.message}`;
}
