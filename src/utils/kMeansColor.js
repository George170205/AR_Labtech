/**
 * K-means++ en JS puro para encontrar los colores dominantes en un conjunto
 * de píxeles. Puro JS (sin TF.js) porque:
 *   - N < 3000 píxeles por zona → el overhead de WebGL no amortiza
 *   - k = 3 → pocas iteraciones necesarias para convergencia
 *   - Síncrono → sin latencia async en el loop de análisis
 *
 * K-means++ mejora la inicialización aleatoria clásica eligiendo centroides
 * con probabilidad proporcional a la distancia al centroide más cercano.
 * Converge en menos iteraciones y evita mínimos locales malos.
 */

/**
 * @param {Array<[r,g,b]>} pixels  Píxeles filtrados de la zona
 * @param {number}          k      Número de clusters (3 recomendado)
 * @param {number}          iters  Máx. iteraciones (10-15 suele bastar)
 * @returns {Array<{rgb:[r,g,b], count:number, ratio:number}>} ordenado desc
 */
export function kMeansColors(pixels, k = 3, iters = 15) {
    if (!pixels.length) return [];
    if (pixels.length < k) {
        return [{ rgb: pixels[0], count: pixels.length, ratio: 1 }];
    }

    const centroids = initKMeansPlusPlus(pixels, k);
    const assignments = new Int32Array(pixels.length);

    for (let iter = 0; iter < iters; iter++) {
        let changed = false;

        // Asignación: cada píxel al centroide más cercano
        for (let i = 0; i < pixels.length; i++) {
            const best = nearestCentroid(pixels[i], centroids);
            if (assignments[i] !== best) {
                assignments[i] = best;
                changed = true;
            }
        }

        if (!changed) break; // convergencia temprana

        // Actualización: recalcular centroides como media de píxeles asignados
        const sums = Array.from({ length: k }, () => [0, 0, 0]);
        const counts = new Int32Array(k);

        for (let i = 0; i < pixels.length; i++) {
            const c = assignments[i];
            sums[c][0] += pixels[i][0];
            sums[c][1] += pixels[i][1];
            sums[c][2] += pixels[i][2];
            counts[c]++;
        }

        for (let c = 0; c < k; c++) {
            if (counts[c] > 0) {
                centroids[c] = [
                    Math.round(sums[c][0] / counts[c]),
                    Math.round(sums[c][1] / counts[c]),
                    Math.round(sums[c][2] / counts[c]),
                ];
            }
        }
    }

    // Contar píxeles por cluster en la asignación final
    const finalCounts = new Int32Array(k);
    for (let i = 0; i < pixels.length; i++) finalCounts[assignments[i]]++;

    return centroids
        .map((rgb, i) => ({
            rgb,
            count: finalCounts[i],
            ratio: finalCounts[i] / pixels.length,
        }))
        .sort((a, b) => b.ratio - a.ratio);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function initKMeansPlusPlus(pixels, k) {
    const centroids = [pixels[Math.floor(Math.random() * pixels.length)]];

    while (centroids.length < k) {
        // Distancia al centroide más cercano para cada píxel
        const dists = pixels.map((p) =>
            Math.min(...centroids.map((c) => sqDist(p, c))),
        );
        const total = dists.reduce((a, b) => a + b, 0);

        // Selección aleatoria ponderada
        let rand = Math.random() * total;
        let chosen = pixels.length - 1;
        for (let i = 0; i < dists.length; i++) {
            rand -= dists[i];
            if (rand <= 0) { chosen = i; break; }
        }
        centroids.push([...pixels[chosen]]);
    }

    return centroids;
}

function nearestCentroid(pixel, centroids) {
    let best = 0;
    let bestDist = sqDist(pixel, centroids[0]);
    for (let c = 1; c < centroids.length; c++) {
        const d = sqDist(pixel, centroids[c]);
        if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
}

function sqDist([r1, g1, b1], [r2, g2, b2]) {
    return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}