import {
    correctGrayWorld,
    correctWhitePaper,
    correctWhiteStretch,
} from './illuminationCorrector.js';
import { extractZoneMasks, extractZonePixels, filterColoredPixels } from './zoneExtractor.js';
import { kMeansColors } from './kMeansColor.js';
import { classifyColors } from './colorClassifier.js';
import { rgbToHex } from './colorUtils.js';

const MIN_COLORED_PIXELS = 60; // umbral mínimo para declarar zona coloreada

/**
 * Pipeline completo de Fase 2.
 *
 * @param {object} tf              Instancia TF.js
 * @param {string} capturedDataURL PNG rectificado de Fase 1
 * @param {string} svgTemplate     String del SVG template
 * @param {object} options
 * @param {Function} [options.onProgress]  (step, total, label) => void
 * @returns {Promise<ZoneColorMap>}
 *
 * ZoneColorMap = Map<zoneId, ZoneResult>
 * ZoneResult = {
 *   label: string,
 *   status: 'colored' | 'uncolored' | 'error',
 *   rgb: [r,g,b] | null,
 *   hex: string | null,
 *   name: string | null,
 *   deltaE: number | null,
 *   confidence: 'alta'|'media'|'baja' | null,
 *   clusters: Array<{rgb, ratio}>,
 * }
 */
export async function analyzeColors(
    tf,
    capturedDataURL,
    svgTemplate,
    { onProgress, illuminationMethod = 'whitePaper' } = {},
) {
    const report = (step, total, label) => onProgress?.(step, total, label);

    // ── 1. Cargar imagen capturada ────────────────────────────────────────────
    report(1, 5, 'Cargando imagen…');
    const imageData = await dataURLtoImageData(capturedDataURL);

    // ── 2. Corregir iluminación ───────────────────────────────────────────────
    report(2, 5, 'Corrigiendo iluminación…');
    const corrected = correctIllumination(imageData, illuminationMethod);

    // ── 3. Extraer máscaras de zonas del SVG ──────────────────────────────────
    report(3, 5, 'Analizando zonas del dibujo…');
    const masks = await extractZoneMasks(svgTemplate, corrected.width, corrected.height);

    // ── 4. K-means por zona ───────────────────────────────────────────────────
    report(4, 5, 'Detectando colores por zona…');
    const resultMap = new Map();
    const coloredZoneIds = [];
    const dominantRgbs = [];

    for (const [zoneId, { mask, label }] of masks) {
        const raw = extractZonePixels(corrected, mask);
        const colored = filterColoredPixels(raw);

        if (colored.length < MIN_COLORED_PIXELS) {
            resultMap.set(zoneId, {
                label,
                status: 'uncolored',
                rgb: null, hex: null, name: null,
                deltaE: null, confidence: null,
                clusters: [],
                pixelCount: raw.length,
                coloredPixelCount: colored.length,
            });
            continue;
        }

        const clusters = kMeansColors(colored, 3, 15);
        // El cluster más grande = color dominante
        // Ignorar clusters con < 5% de píxeles (manchas residuales)
        const dominant = clusters.find((c) => c.ratio > 0.05) || clusters[0];

        coloredZoneIds.push(zoneId);
        dominantRgbs.push(dominant.rgb);

        resultMap.set(zoneId, {
            label,
            status: 'pending', // se actualiza en paso 5
            rgb: dominant.rgb,
            hex: rgbToHex(dominant.rgb),
            clusters: clusters.map(({ rgb, ratio }) => ({ rgb, ratio })),
            pixelCount: raw.length,
            coloredPixelCount: colored.length,
        });
    }

    // ── 5. Clasificar nombres con TF.js (batch) ───────────────────────────────
    report(5, 5, 'Clasificando colores…');
    if (dominantRgbs.length > 0) {
        const named = await classifyColors(tf, dominantRgbs);
        coloredZoneIds.forEach((zoneId, i) => {
            const entry = resultMap.get(zoneId);
            resultMap.set(zoneId, {
                ...entry,
                status: 'colored',
                name: named[i].name,
                hex: named[i].hex, // hex de la paleta (más limpio para animación)
                rawHex: entry.hex, // hex exacto del color detectado
                deltaE: named[i].deltaE,
                confidence: named[i].confidence,
            });
        });
    }

    return resultMap;
}

function correctIllumination(imageData, method) {
    const methods = {
        whitePaper: () => correctWhitePaper(imageData, 30),
        grayWorld: () => correctGrayWorld(imageData),
        whiteStretch: () => correctWhiteStretch(imageData, 95),
    };

    return (methods[method] ?? methods.whitePaper)();
}

// ─── helper ───────────────────────────────────────────────────────────────────

export function dataURLtoImageData(dataURL) {
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
        img.onerror = () => reject(new Error('No se pudo cargar la imagen capturada'));
        img.src = dataURL;
    });
}
