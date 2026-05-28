import { COLOR_PALETTE, rgbToLab } from './colorUtils.js';

/**
 * Clasifica colores dominantes de TODAS las zonas en una sola pasada matricial.
 *
 * Por qué TF.js aquí:
 *   Con 10 zonas y 25 entradas en la paleta, calcular [10, 25] distancias ΔE
 *   como una operación matricial en WebGL es ~8x más rápido que un doble loop JS.
 *   Además, si en Fase 2.5 añadimos un modelo de corrección de color entrenado
 *   (ej. transformar las predicciones por tipo de papel/lápiz), TF.js ya está
 *   disponible para inferencia.
 *
 * @param {object}         tf          Instancia de TensorFlow.js
 * @param {Array<[r,g,b]>} rgbColors   Un color por zona (el dominante)
 * @returns {Promise<Array<{name, hex, rgb, deltaE}>>}
 */
export async function classifyColors(tf, rgbColors) {
    if (!rgbColors.length) return [];

    // Convertir zonas a LAB → tensor [Z, 3]
    const zoneLab = rgbColors.map(([r, g, b]) => rgbToLab(r, g, b));
    const zonesT = tf.tensor2d(zoneLab, [zoneLab.length, 3], 'float32');

    // Paleta en LAB → tensor [P, 3]
    const paletteLab = COLOR_PALETTE.map((c) => c.lab);
    const paletteT = tf.tensor2d(paletteLab, [paletteLab.length, 3], 'float32');

    // Distancias: [Z, 1, 3] - [1, P, 3] → [Z, P, 3] → sum → sqrt → [Z, P]
    const zonesExp = zonesT.expandDims(1);   // [Z, 1, 3]
    const paletExp = paletteT.expandDims(0); // [1, P, 3]
    const diff = zonesExp.sub(paletExp);  // [Z, P, 3]
    const deltaE = diff.square().sum(2).sqrt(); // [Z, P]

    const [indicesT, minDeltaT] = [deltaE.argMin(1), deltaE.min(1)];
    const indices = await indicesT.data();   // Int32Array [Z]
    const minDeltaE = await minDeltaT.data(); // Float32Array [Z]

    // Liberar tensores (WebGL memory management)
    [zonesT, paletteT, zonesExp, paletExp, diff, deltaE, indicesT, minDeltaT]
        .forEach((t) => t.dispose());

    return Array.from(indices).map((idx, i) => ({
        ...COLOR_PALETTE[idx],
        deltaE: minDeltaE[i],
        // ΔE < 10: color confiable | 10-25: color aproximado | >25: bajo contraste
        confidence: minDeltaE[i] < 10 ? 'alta' : minDeltaE[i] < 25 ? 'media' : 'baja',
    }));
}