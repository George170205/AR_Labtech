// ─── Paleta de colores nombrados para niños ────────────────────────────────
// Los valores LAB se precomputan una vez y se reutilizan en cada clasificación.
// Añadir entradas para cubrir mejor los lápices de colores reales del niño.

const RAW_PALETTE = [
    { name: 'rojo', hex: '#DC3232', rgb: [220, 50, 50] },
    { name: 'rojo oscuro', hex: '#8B1A1A', rgb: [139, 26, 26] },
    { name: 'naranja', hex: '#F07820', rgb: [240, 120, 32] },
    { name: 'amarillo', hex: '#FAD800', rgb: [250, 216, 0] },
    { name: 'amarillo claro', hex: '#FFFF66', rgb: [255, 255, 102] },
    { name: 'verde', hex: '#3CB43C', rgb: [60, 180, 60] },
    { name: 'verde oscuro', hex: '#006400', rgb: [0, 100, 0] },
    { name: 'verde lima', hex: '#AADC00', rgb: [170, 220, 0] },
    { name: 'celeste', hex: '#64B4F0', rgb: [100, 180, 240] },
    { name: 'azul', hex: '#2850DC', rgb: [40, 80, 220] },
    { name: 'azul oscuro', hex: '#00008B', rgb: [0, 0, 139] },
    { name: 'morado', hex: '#8C3CC8', rgb: [140, 60, 200] },
    { name: 'violeta', hex: '#EE82EE', rgb: [238, 130, 238] },
    { name: 'rosa', hex: '#F064B4', rgb: [240, 100, 180] },
    { name: 'rosa claro', hex: '#FFB6C1', rgb: [255, 182, 193] },
    { name: 'marrón', hex: '#825028', rgb: [130, 80, 40] },
    { name: 'marrón claro', hex: '#C4A070', rgb: [196, 160, 112] },
    { name: 'negro', hex: '#1E1E1E', rgb: [30, 30, 30] },
    { name: 'gris', hex: '#969696', rgb: [150, 150, 150] },
    { name: 'gris claro', hex: '#D3D3D3', rgb: [211, 211, 211] },
    { name: 'blanco', hex: '#F0F0F0', rgb: [240, 240, 240] },
    { name: 'dorado', hex: '#FFD700', rgb: [255, 215, 0] },
    { name: 'turquesa', hex: '#40E0D0', rgb: [64, 224, 208] },
    { name: 'fucsia', hex: '#FF1493', rgb: [255, 20, 147] },
    { name: 'salmón', hex: '#FA8072', rgb: [250, 128, 114] },
];

// Precomputar LAB de la paleta para no recalcular en cada frame
export const COLOR_PALETTE = RAW_PALETTE.map((entry) => ({
    ...entry,
    lab: rgbToLab(entry.rgb[0], entry.rgb[1], entry.rgb[2]),
}));

// ─── Conversión RGB → CIE LAB ─────────────────────────────────────────────
// CIE LAB es un espacio perceptualmente uniforme: la distancia euclidiana
// en LAB (ΔE) correlaciona con cómo el ojo humano percibe diferencias de color.
// Esto es crucial para mapear colores de lápiz (que varían por presión, papel,
// iluminación) a nombres de colores discretos de forma robusta.

export function rgbToLab(r, g, b) {
    // 1. Normalizar a [0, 1]
    let rn = r / 255, gn = g / 255, bn = b / 255;

    // 2. Linealizar (remover gamma sRGB)
    const linearize = (v) =>
        v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    rn = linearize(rn);
    gn = linearize(gn);
    bn = linearize(bn);

    // 3. Linear RGB → XYZ (matriz D65, sRGB)
    const X = rn * 0.4124564 + gn * 0.3575761 + bn * 0.1804375;
    const Y = rn * 0.2126729 + gn * 0.7151522 + bn * 0.0721750;
    const Z = rn * 0.0193339 + gn * 0.1191920 + bn * 0.9503041;

    // 4. XYZ → LAB (iluminante D65: Xn=0.95047, Yn=1.0, Zn=1.08883)
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(X / 0.95047);
    const fy = f(Y / 1.0);
    const fz = f(Z / 1.08883);

    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// ΔE76 — suficiente para distinguir colores básicos de niños.
// ΔE2000 sería más preciso pero ~4x más costoso de calcular.
export function deltaE([L1, a1, b1], [L2, a2, b2]) {
    return Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

/** Convierte un [R, G, B] en string hex '#RRGGBB' */
export function rgbToHex([r, g, b]) {
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}