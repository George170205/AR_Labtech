/**
 * Convierte cada zona del SVG en una máscara binaria alineada
 * a las dimensiones de la imagen capturada.
 *
 * Estrategia:
 *   Para cada <g data-zone="X">, clonar el SVG entero, pintar
 *   SÓLO esa zona de blanco y el resto de negro, renderizar a canvas.
 *   Los píxeles blancos resultantes son la máscara de esa zona.
 *
 * Por qué esta estrategia y no flood-fill sobre la imagen capturada:
 *   - Flood-fill depende de bordes perfectos en la imagen → falla con
 *     colores oscuros que se acercan al contorno.
 *   - Las máscaras SVG son exactas y reutilizables para cualquier captura
 *     del mismo template.
 *   - Permite nombrar las zonas desde el propio SVG (data-label).
 */

/**
 * @param {string} svgString   Contenido SVG como string
 * @param {number} targetW     Ancho de la imagen capturada
 * @param {number} targetH     Alto de la imagen capturada
 * @returns {Promise<Map<string, {mask: Uint8Array, label: string}>>}
 */
export async function extractZoneMasks(svgString, targetW, targetH) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgRoot = doc.documentElement;

    // Detectar error de parseo
    if (svgRoot.querySelector('parsererror')) {
        throw new Error('SVG inválido — verifica el template');
    }

    const zoneEls = svgRoot.querySelectorAll('[data-zone]');
    const masks = new Map();

    for (const el of zoneEls) {
        const zoneId = el.getAttribute('data-zone');
        const label = el.getAttribute('data-label') || zoneId;

        const maskSvg = buildMaskSvg(svgRoot, zoneId, targetW, targetH);
        // Data URL en lugar de Blob URL: evita fallos silenciosos en Chrome móvil con HTTPS
        const dataURL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(maskSvg);

        const mask = await renderSvgToMask(dataURL, targetW, targetH);
        masks.set(zoneId, { mask, label });
    }

    return masks;
}

/**
 * Devuelve los píxeles RGBA de imageData que pertenecen a una zona (mask=1).
 * Submuestrea a maxPixels para no saturar el k-means.
 *
 * @returns {Array<[r,g,b]>}
 */
export function extractZonePixels(imageData, mask, maxPixels = 3000) {
    const { data, width } = imageData;
    const pixels = [];

    for (let i = 0; i < mask.length; i++) {
        if (mask[i] === 0) continue;
        const d = i * 4;
        pixels.push([data[d], data[d + 1], data[d + 2]]);
    }

    // Submuestreo uniforme para limitar cómputo
    if (pixels.length <= maxPixels) return pixels;
    const step = Math.ceil(pixels.length / maxPixels);
    return pixels.filter((_, idx) => idx % step === 0);
}

/**
 * Filtra píxeles que claramente no son color del lápiz:
 *   - Muy brillantes (papel sin colorear, blanco)
 *   - Muy oscuros (líneas de contorno)
 *   - Muy poco saturados (grises, blancuzcos)
 *
 * Los umbrales son críticos: si son muy estrictos se pierden colores
 * pastel o muy oscuros. Ajustar según el tipo de lápices del niño.
 */
export function filterColoredPixels(pixels) {
    return pixels.filter(([r, g, b]) => {
        const brightness = (r + g + b) / 3;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max - min; // 0-255

        // Excluir: papel blanco (muy brillante y poco saturado)
        if (brightness > 220 && saturation < 20) return false;
        // Excluir: líneas de contorno (muy oscuras)
        if (brightness < 45) return false;
        // Excluir: grises neutros (sombras, suciedad)
        if (saturation < 12) return false;

        return true;
    });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildMaskSvg(svgRoot, targetZoneId, width, height) {
    const clone = svgRoot.cloneNode(true);
    clone.setAttribute('width', width);
    clone.setAttribute('height', height);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Ocultar elementos que no son zonas de datos (contornos, texto, etc.)
    clone.querySelectorAll(':not([data-zone])').forEach((el) => {
        if (el === clone) return;
        // Mantener los contenedores <g> que agrupan zonas
        if (el.tagName === 'g' && el.hasAttribute('data-zone')) return;
        // Ocultar lo demás
        if (!el.closest('[data-zone]')) el.style.display = 'none';
    });

    // Pintar todas las zonas de negro — incluyendo hijos explícitamente.
    // Los hijos tienen fill="white" como atributo de presentación, que tiene
    // precedencia sobre el CSS heredado del <g> padre. Sin esto, todos los
    // hijos quedan blancos y todas las máscaras son idénticas.
    clone.querySelectorAll('[data-zone]').forEach((el) => {
        el.style.fill = 'black';
        el.style.stroke = 'none';
        el.querySelectorAll('*').forEach((child) => {
            child.style.fill = 'black';
            child.style.stroke = 'none';
        });
    });

    // Pintar sólo la zona objetivo de blanco
    const target = clone.querySelector(`[data-zone="${targetZoneId}"]`);
    if (target) {
        target.style.fill = 'white';
        target.querySelectorAll('*').forEach((child) => {
            child.style.fill = 'white';
            child.style.stroke = 'none';
        });
    }

    return new XMLSerializer().serializeToString(clone);
}

function renderSvgToMask(svgUrl, width, height) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            const { data } = ctx.getImageData(0, 0, width, height);
            // Máscara binaria: 1 = dentro de la zona, 0 = fuera
            const mask = new Uint8Array(width * height);
            for (let i = 0; i < mask.length; i++) {
                // Canal rojo > 128 = blanco (zona activa)
                mask[i] = data[i * 4] > 128 ? 1 : 0;
            }
            resolve(mask);
        };

        img.onerror = () => reject(new Error('No se pudo renderizar la máscara SVG'));
        img.src = svgUrl;
    });
}