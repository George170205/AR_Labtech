import { useState, useEffect } from 'react';
import './OnboardingOverlay.css';

const STORAGE_KEY = 'libro-colorear-onboarded-v1';

const STEPS = [
    {
        emoji: '🎨',
        title: '¡Bienvenido!',
        text: 'Con esta app tus dibujos cobran vida. ¡Es muy fácil!',
    },
    {
        emoji: '🖨️',
        title: 'Elige e imprime',
        text: 'Elige un dibujo, descárgalo e imprímelo en papel.',
    },
    {
        emoji: '✏️',
        title: 'Colorea',
        text: '¡Usa tus lápices de colores favoritos! Colorea dentro de las líneas.',
    },
    {
        emoji: '📷',
        title: 'Escanea',
        text: 'Pon el dibujo en una mesa bien iluminada y pulsa el botón verde.',
    },
    {
        emoji: '✨',
        title: '¡Magia!',
        text: 'Tu dibujo cobra vida con tus propios colores. ¡Compártelo con tu familia!',
    },
];

/**
 * Se muestra automáticamente en la primera visita.
 * Tras completarlo, guarda en localStorage para no volver a aparecer.
 * Se puede re-abrir con el botón "?" en el header.
 *
 * @param {{ forceOpen, onClose }} props
 */
export default function OnboardingOverlay({ forceOpen = false, onClose }) {
    const [visible, setVisible] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        const done = getOnboarded();
        if (!done || forceOpen) setVisible(true);
    }, [forceOpen]);

    function handleClose() {
        setOnboarded();
        setVisible(false);
        setStep(0);
        onClose?.();
    }

    function handleNext() {
        if (step < STEPS.length - 1) {
            setStep((s) => s + 1);
        } else {
            handleClose();
        }
    }

    if (!visible) return null;

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    return (
        <div className="ob-backdrop" onClick={handleClose}>
            <div className="ob-card" onClick={(e) => e.stopPropagation()}>
                {/* Dots de progreso */}
                <div className="ob-dots">
                    {STEPS.map((_, i) => (
                        <button
                            key={i}
                            className={`ob-dot ${i === step ? 'ob-dot--active' : ''}`}
                            onClick={() => setStep(i)}
                            aria-label={`Ir al paso ${i + 1}`}
                        />
                    ))}
                </div>

                {/* Contenido */}
                <div className="ob-emoji">{current.emoji}</div>
                <h2 className="ob-title">{current.title}</h2>
                <p className="ob-text">{current.text}</p>

                {/* Navegación */}
                <div className="ob-nav">
                    {step > 0 && (
                        <button className="ob-btn ob-btn--back" onClick={() => setStep((s) => s - 1)}>
                            ← Atrás
                        </button>
                    )}
                    <button className="ob-btn ob-btn--next" onClick={handleNext}>
                        {isLast ? '¡Empezar! 🚀' : 'Siguiente →'}
                    </button>
                </div>

                <button className="ob-skip" onClick={handleClose}>
                    Saltar tutorial
                </button>
            </div>
        </div>
    );
}

function getOnboarded() {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function setOnboarded() {
    try {
        localStorage.setItem(STORAGE_KEY, '1');
    } catch {
        // Safari privado puede bloquear localStorage; el tutorial simplemente reaparece.
    }
}
