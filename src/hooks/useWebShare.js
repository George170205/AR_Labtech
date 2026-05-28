import { useCallback, useRef } from 'react';

/**
 * Abstrae tres mecanismos de exportación:
 *   1. Web Share API  → compartir en móvil (WhatsApp, AirDrop, etc.)
 *   2. Descarga PNG   → `<a download>` como fallback universal
 *   3. MediaRecorder  → grabar 3s de video del canvas de PixiJS
 *
 * Notas de compatibilidad:
 *   - Web Share con `files` requiere HTTPS y navegador compatible (Chrome 89+, Safari 15+)
 *   - canvas.captureStream() NO funciona en iOS Safari < 17
 *   - MediaRecorder soporta 'video/webm' en Chrome/Firefox; Safari requiere 'video/mp4'
 */

export function useWebShare() {
    const canShare = 'share' in navigator;
    const canRecord = 'captureStream' in HTMLCanvasElement.prototype;

    /** Descarga un dataURL como archivo */
    const downloadImage = useCallback((dataURL, filename = 'mi-dibujo.png') => {
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = filename;
        a.click();
    }, []);

    /**
     * Comparte imagen via Web Share API o descarga como fallback.
     * @param {string} dataURL   PNG en base64
     * @param {string} title
     * @param {string} text      Descripción para la vista previa al compartir
     */
    const shareImage = useCallback(async (dataURL, title, text) => {
        const blob = await dataURLToBlob(dataURL);
        const file = new File([blob], 'mi-dibujo-cobra-vida.png', { type: 'image/png' });

        if (canShare && navigator.canShare?.({ files: [file] })) {
            try {
                await navigator.share({ title, text, files: [file] });
                return { shared: true };
            } catch (err) {
                if (err.name !== 'AbortError') throw err;
                return { shared: false, aborted: true };
            }
        }

        // Fallback: descarga directa
        downloadImage(dataURL, 'mi-dibujo-cobra-vida.png');
        return { shared: false, downloaded: true };
    }, [canShare, downloadImage]);

    /**
     * Graba N segundos del canvas de PixiJS como video WebM/MP4.
     * @param {HTMLCanvasElement} canvas   Canvas de PixiJS
     * @param {number}            ms       Duración en milisegundos (default 3000)
     * @returns {Promise<Blob>}
     */
    const recordCanvas = useCallback((canvas, ms = 3000) => {
        return new Promise((resolve, reject) => {
            if (!canRecord) {
                reject(new Error('captureStream no soportado en este navegador'));
                return;
            }

            // Elegir el formato soportado
            const mimeType = [
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm',
                'video/mp4',
            ].find((m) => MediaRecorder.isTypeSupported(m));

            if (!mimeType) {
                reject(new Error('MediaRecorder no soportado'));
                return;
            }

            const stream = canvas.captureStream(30);
            const recorder = new MediaRecorder(stream, { mimeType });
            const chunks = [];

            recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
            recorder.onerror = (e) => reject(e.error);
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: mimeType });
                stream.getTracks().forEach((t) => t.stop());
                resolve(blob);
            };

            recorder.start(100); // capturar chunks cada 100ms
            setTimeout(() => recorder.stop(), ms);
        });
    }, [canRecord]);

    return { canShare, canRecord, shareImage, downloadImage, recordCanvas };
}

// ─── helper ───────────────────────────────────────────────────────────────────

function dataURLToBlob(dataURL) {
    const [meta, data] = dataURL.split(',');
    const mime = meta.match(/:(.*?);/)[1];
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    return Promise.resolve(new Blob([bytes], { type: mime }));
}