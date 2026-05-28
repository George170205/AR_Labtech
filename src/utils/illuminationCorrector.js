/**
 * RETO CRÍTICO de Fase 2: corregir el color bajo iluminación arbitraria.
 *
 * Disponemos de una ventaja clave: el papel siempre tiene márgenes blancos
 * alrededor del dibujo. Esos márgenes actúan como referencia de blanco real
 * bajo la iluminación actual → White Paper Retinex.
 *
 * Métodos implementados:
 *   - whitePaper (recomendado): usa el borde del papel como referencia
 *   - grayWorld: asume que el promedio de la escena es gris neutro
 *   - whiteStretch: percentil 95 de cada canal (sin asumir nada del papel)
 */

/**
 * Corrige iluminación usando los márgenes del papel como referencia blanca.
 *
 * Por qué funciona: el borde del papel debería ser blanco puro bajo iluminación
 * neutral. Si aparece amarillento (luz cálida), rojizo (atardecer), etc.,
 * esa desviación es exactamente el tinte de iluminación a compensar.
 *
 * @param {ImageData} imageData   Imagen rectificada de Fase 1
 * @param {number}    borderSize  Ancho del margen a muestrear (px)
 * @returns {ImageData}           Imagen corregida (nueva copia, no muta)
 */
export function correctWhitePaper(imageData, borderSize = 30) {
    const { data, width, height } = imageData;

    // Recoger píxeles del borde (los márgenes blancos del papel)
    const borderR = [], borderG = [], borderB = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const inBorder =
                x < borderSize || x >= width - borderSize ||
                y < borderSize || y >= height - borderSize;
            if (!inBorder) continue;

            const i = (y * width + x) * 4;
            borderR.push(data[i]);
            borderG.push(data[i + 1]);
            borderB.push(data[i + 2]);
        }
    }

    // Percentil 90 como referencia (robusto si hay sombras en las esquinas)
    const refR = percentile(borderR, 90);
    const refG = percentile(borderG, 90);
    const refB = percentile(borderB, 90);

    return applyChannelScale(imageData, refR, refG, refB);
}

/**
 * Gray World: el promedio de todos los píxeles debería ser gris neutro.
 * Más rápido pero menos preciso que whitePaper cuando hay mucho color saturado.
 */
export function correctGrayWorld(imageData) {
    const { data } = imageData;
    let sumR = 0, sumG = 0, sumB = 0;
    const n = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
        sumR += data[i];
        sumG += data[i + 1];
        sumB += data[i + 2];
    }

    const gray = (sumR + sumG + sumB) / (3 * n);
    return applyChannelScale(imageData, sumR / n, sumG / n, sumB / n, gray);
}

/**
 * White Stretch: el píxel más brillante por canal = blanco puro.
 * Útil cuando no hay márgenes (imágenes recortadas sin borde).
 * Puede saturar si hay especulares (reflejos brillantes en el papel).
 */
export function correctWhiteStretch(imageData, percentileValue = 95) {
    const { data } = imageData;
    const channelR = [], channelG = [], channelB = [];

    for (let i = 0; i < data.length; i += 4) {
        channelR.push(data[i]);
        channelG.push(data[i + 1]);
        channelB.push(data[i + 2]);
    }

    const refR = percentile(channelR, percentileValue);
    const refG = percentile(channelG, percentileValue);
    const refB = percentile(channelB, percentileValue);

    return applyChannelScale(imageData, refR, refG, refB);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Escala cada canal para que (refR, refG, refB) → (255, 255, 255).
 * Si targetGray está definido, escala hacia ese gris en lugar de 255.
 */
function applyChannelScale(imageData, refR, refG, refB, targetGray = 255) {
    const { data, width, height } = imageData;
    const out = new Uint8ClampedArray(data.length);

    const sR = refR > 0 ? targetGray / refR : 1;
    const sG = refG > 0 ? targetGray / refG : 1;
    const sB = refB > 0 ? targetGray / refB : 1;

    for (let i = 0; i < data.length; i += 4) {
        out[i] = clamp(data[i] * sR);
        out[i + 1] = clamp(data[i + 1] * sG);
        out[i + 2] = clamp(data[i + 2] * sB);
        out[i + 3] = data[i + 3]; // alpha sin cambios
    }

    return new ImageData(out, width, height);
}

function clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function percentile(arr, p) {
    if (!arr.length) return 255;
    const sorted = Int32Array.from(arr).sort();
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
}