import { useState, useCallback } from 'react';
import { useWebShare } from '../hooks/useWebShare.js';
import './ShareModal.css';

/**
 * Modal de compartir/guardar con 3 acciones:
 *   1. Descargar PNG  — universal
 *   2. Compartir     — Web Share API (móvil) o descarga (desktop)
 *   3. Grabar video  — MediaRecorder en el canvas de PixiJS
 *
 * @param {{ imageDataURL, pixiCanvas, templateLabel, onClose }} props
 */
export default function ShareModal({ imageDataURL, pixiCanvas, templateLabel, onClose }) {
    const { canRecord, shareImage, downloadImage, recordCanvas } = useWebShare();

    const [recording, setRecording] = useState(false);
    const [videoURL, setVideoURL] = useState(null);
    const [shareStatus, setShareStatus] = useState(null); // null | 'shared' | 'downloaded'

    const handleDownload = useCallback(() => {
        downloadImage(imageDataURL, `mi-${templateLabel}-cobra-vida.png`);
        setShareStatus('downloaded');
    }, [downloadImage, imageDataURL, templateLabel]);

    const handleShare = useCallback(async () => {
        try {
            const result = await shareImage(
                imageDataURL,
                `¡Mi ${templateLabel} cobra vida!`,
                '¡Mira mi dibujo animado! Creado con Libro de Colorear',
            );
            setShareStatus(result.shared ? 'shared' : 'downloaded');
        } catch (err) {
            console.error(err);
        }
    }, [shareImage, imageDataURL, templateLabel]);

    const handleRecord = useCallback(async () => {
        if (!pixiCanvas || recording) return;
        setRecording(true);
        setVideoURL(null);
        try {
            const blob = await recordCanvas(pixiCanvas, 3500);
            const url = URL.createObjectURL(blob);
            const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
            setVideoURL({ url, ext });
        } catch (err) {
            console.error('No se pudo grabar:', err.message);
        } finally {
            setRecording(false);
        }
    }, [pixiCanvas, recordCanvas, recording]);

    const handleDownloadVideo = useCallback(() => {
        if (!videoURL) return;
        const a = document.createElement('a');
        a.href = videoURL.url;
        a.download = `mi-${templateLabel}-cobra-vida.${videoURL.ext}`;
        a.click();
    }, [videoURL, templateLabel]);

    return (
        <div className="sm-backdrop" onClick={onClose}>
            <div className="sm-modal" onClick={(e) => e.stopPropagation()}>
                <button className="sm-close" onClick={onClose}>✕</button>
                <h2 className="sm-title">¡Guarda tu creación!</h2>

                {/* Preview */}
                <div className="sm-preview">
                    <img src={imageDataURL} alt="Tu dibujo" className="sm-preview-img" />
                </div>

                {/* Estado de compartición */}
                {shareStatus && (
                    <p className="sm-status">
                        {shareStatus === 'shared' ? '✅ ¡Compartido!' : '✅ ¡Descargado!'}
                    </p>
                )}

                {/* Acciones */}
                <div className="sm-actions">
                    <ShareButton
                        emoji="💾"
                        label="Guardar imagen"
                        sublabel="PNG en tu galería"
                        onClick={handleDownload}
                        variant="primary"
                    />

                    <ShareButton
                        emoji="📤"
                        label="Compartir"
                        sublabel="WhatsApp, AirDrop…"
                        onClick={handleShare}
                        variant="secondary"
                    />

                    {canRecord && (
                        <ShareButton
                            emoji={recording ? '⏺️' : '🎥'}
                            label={recording ? 'Grabando 3s…' : 'Grabar video'}
                            sublabel={recording ? 'Espera un momento' : 'Video animado'}
                            onClick={handleRecord}
                            disabled={recording}
                            variant="secondary"
                        />
                    )}
                </div>

                {/* Download video si ya se grabó */}
                {videoURL && (
                    <button className="sm-video-btn" onClick={handleDownloadVideo}>
                        ⬇️ Descargar video ({videoURL.ext.toUpperCase()})
                    </button>
                )}
            </div>
        </div>
    );
}

function ShareButton({ emoji, label, sublabel, onClick, disabled, variant }) {
    return (
        <button
            className={`sm-btn sm-btn--${variant} ${disabled ? 'sm-btn--disabled' : ''}`}
            onClick={onClick}
            disabled={disabled}
        >
            <span className="sm-btn-emoji">{emoji}</span>
            <span className="sm-btn-text">
                <span className="sm-btn-label">{label}</span>
                <span className="sm-btn-sub">{sublabel}</span>
            </span>
        </button>
    );
}