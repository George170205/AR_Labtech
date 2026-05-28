import * as PIXI from 'pixi.js';

// Orden de renderizado: de fondo a frente
const LAYER_ORDER = [
    'cola',
    'pata_trasera',
    'cuerpo',
    'pecho',
    'vientre',
    'ala_sup_izq',
    'ala_sup_der',
    'ala_inf_izq',
    'ala_inf_der',
    'ala',
    'aleta_dorsal',
    'aleta_pectoral',
    'escamas',
    'manchas',
    'dorsal',
    'pata_delantera',
    'cabeza',
    'pico',
];

// Tamaño fijo del renderer — CSS escala el canvas al contenedor.
// Fijo evita bugs de dimensionamiento antes de que React monte el elemento.
export const PIXI_W = 720;
export const PIXI_H = 540;

/**
 * Construye la escena PixiJS completa a partir del SVG template y el mapa
 * de colores detectados en Fase 2.
 *
 * @param {PIXI.Application} app
 * @param {string}           svgString   SVG como string (?raw import)
 * @param {Map|null}         zoneColorMap  resultado de colorAnalyzer
 * @returns {Promise<SceneInfo>}
 *
 * SceneInfo = { root, sprites, contoursSprite, svgW, svgH }
 */
export async function buildPixiScene(app, svgString, zoneColorMap) {
    const { svgW, svgH, zoneMetadata } = parseSvgInfo(svgString);

    // Escalar el SVG para que quepa en el canvas con un 4% de margen
    const scale = Math.min(PIXI_W / svgW, PIXI_H / svgH) * 0.96;
    const offsetX = (PIXI_W - svgW * scale) / 2;
    const offsetY = (PIXI_H - svgH * scale) / 2;

    // Contenedor raíz (toda la escena se escala desde aquí)
    const root = new PIXI.Container();
    root.x = offsetX;
    root.y = offsetY;
    root.scale.set(scale);
    app.stage.addChild(root);

    // Fondo blanco del papel
    const bg = new PIXI.Graphics();
    bg.beginFill(0xffffff, 1);
    bg.drawRect(0, 0, svgW, svgH);
    bg.endFill();
    root.addChild(bg);

    // Renderizar todas las zonas en paralelo (≈ 2× más rápido en móvil)
    const preferredZones = LAYER_ORDER.filter((id) => zoneMetadata.has(id));
    const remainingZones = [...zoneMetadata.keys()].filter((id) => !LAYER_ORDER.includes(id));
    const zonesInOrder = [...preferredZones, ...remainingZones];

    const [zoneResults, contoursCanvas] = await Promise.all([
        Promise.all(
            zonesInOrder.map((zoneId) => {
                const fill = resolveFillColor(zoneId, zoneColorMap);
                return renderZoneCanvas(svgString, zoneId, fill, svgW, svgH).then(
                    (canvas) => ({ zoneId, canvas }),
                );
            }),
        ),
        renderContoursCanvas(svgString, svgW, svgH),
    ]);

    // Construir sprites de zona
    const sprites = new Map();

    for (const { zoneId, canvas } of zoneResults) {
        const meta = zoneMetadata.get(zoneId);
        const texture = PIXI.Texture.from(canvas);
        const sprite = new PIXI.Sprite(texture);

        // Tamaño igual al viewBox del SVG (la máscara ocupa todo el área)
        sprite.width = svgW;
        sprite.height = svgH;

        // Pivot de rotación articulada.
        // pivot(px, py): el sprite rota alrededor del punto (px,py) en su espacio local.
        // position(px, py): coloca el pivot en ese punto del espacio padre.
        // → visualmente el sprite queda en la misma posición que sin pivot,
        //   pero sprite.rotation lo hace girar alrededor de ese punto.
        if (meta?.pivotX != null && meta?.pivotY != null) {
            sprite.pivot.set(meta.pivotX, meta.pivotY);
            sprite.position.set(meta.pivotX, meta.pivotY);
        }

        sprite.alpha = 0; // oculto hasta la secuencia de reveal
        root.addChild(sprite);
        sprites.set(zoneId, { sprite, meta });
    }

    // Capa de contornos: siempre encima, estática
    const contoursSprite = new PIXI.Sprite(PIXI.Texture.from(contoursCanvas));
    contoursSprite.width = svgW;
    contoursSprite.height = svgH;
    contoursSprite.alpha = 0;
    root.addChild(contoursSprite);

    return { root, sprites, contoursSprite, svgW, svgH };
}

export function buildColoredSvgDataURL(svgString, zoneColorMap) {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const svgRoot = doc.documentElement;

    svgRoot.querySelectorAll('[data-zone]').forEach((el) => {
        const zoneId = el.getAttribute('data-zone');
        styleGroup(el, `fill:${resolveFillColor(zoneId, zoneColorMap)};stroke:none`);
    });

    svgRoot.querySelector('text')?.setAttribute('style', 'display:none');

    const serialized = new XMLSerializer().serializeToString(svgRoot);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
}

// ─── Color resolve ────────────────────────────────────────────────────────────

function resolveFillColor(zoneId, zoneColorMap) {
    if (!zoneColorMap) return '#d0d0d0';
    const result = zoneColorMap.get(zoneId);
    if (result?.status === 'colored') return result.rawHex ?? result.hex ?? '#d0d0d0';
    if (result?.status === 'uncolored') return '#f0f0f0';
    return '#d0d0d0';
}

// ─── SVG parsing ──────────────────────────────────────────────────────────────

function parseSvgInfo(svgString) {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const root = doc.documentElement;

    const vb = root.getAttribute('viewBox')?.split(/\s+/).map(Number);
    const svgW = vb?.[2] ?? parseFloat(root.getAttribute('width')) ?? 500;
    const svgH = vb?.[3] ?? parseFloat(root.getAttribute('height')) ?? 380;

    const zoneMetadata = new Map();
    root.querySelectorAll('[data-zone]').forEach((el) => {
        const id = el.getAttribute('data-zone');
        zoneMetadata.set(id, {
            id,
            label: el.getAttribute('data-label') ?? id,
            pivotX: parseFloatSafe(el.getAttribute('data-pivot-x')),
            pivotY: parseFloatSafe(el.getAttribute('data-pivot-y')),
            anim: el.getAttribute('data-anim') ?? null,
            amplitude: parseFloatSafe(el.getAttribute('data-anim-amplitude')) ?? 10,
            speed: parseFloatSafe(el.getAttribute('data-anim-speed')) ?? 1,
            offset: parseFloatSafe(el.getAttribute('data-anim-offset')) ?? 0,
        });
    });

    return { svgW, svgH, zoneMetadata };
}

// ─── Canvas rendering ──────────────────────────────────────────────────────────

/**
 * Renderiza UNA zona con su color de relleno.
 * - Todas las demás zonas: transparentes
 * - Capa de contornos: oculta (se renderiza por separado como overlay estático)
 * - Fondo del SVG: oculto
 */
async function renderZoneCanvas(svgString, zoneId, fillColor, w, h) {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const svgRoot = doc.documentElement;
    svgRoot.setAttribute('width', w);
    svgRoot.setAttribute('height', h);

    // Ocultar fondo
    const bgRect = svgRoot.querySelector('rect:not([data-zone])');
    bgRect?.setAttribute('style', 'display:none');

    // Ocultar contornos
    svgRoot.getElementById('contornos')?.setAttribute('style', 'display:none');

    // Texto de pie de página
    svgRoot.querySelector('text')?.setAttribute('style', 'display:none');

    // Todas las zonas: transparentes
    svgRoot.querySelectorAll('[data-zone]').forEach((el) =>
        styleGroup(el, 'fill:transparent;stroke:none'),
    );

    // Zona objetivo: color detectado
    const target = svgRoot.querySelector(`[data-zone="${zoneId}"]`);
    if (target) styleGroup(target, `fill:${fillColor};stroke:none`);

    return svgToCanvas(new XMLSerializer().serializeToString(svgRoot), w, h);
}

/**
 * Renderiza SÓLO los contornos (líneas negras, sin rellenos, sin zonas).
 * Resultado: PNG transparente con líneas negras — se superpone como overlay.
 */
async function renderContoursCanvas(svgString, w, h) {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const svgRoot = doc.documentElement;
    svgRoot.setAttribute('width', w);
    svgRoot.setAttribute('height', h);

    // Ocultar todo excepto #contornos
    svgRoot.querySelector('rect:not([data-zone])')?.setAttribute('style', 'display:none');
    svgRoot.querySelectorAll('[data-zone]').forEach((el) =>
        el.setAttribute('style', 'display:none'),
    );
    svgRoot.querySelector('text')?.setAttribute('style', 'display:none');
    // #contornos queda visible con sus atributos originales de stroke

    return svgToCanvas(new XMLSerializer().serializeToString(svgRoot), w, h);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function styleGroup(el, style) {
    el.setAttribute('style', style);
    el.querySelectorAll('*').forEach((child) => child.setAttribute('style', style));
}

function svgToCanvas(svgStr, w, h) {
    // Usamos data URL en lugar de Blob URL: Chrome móvil con HTTPS puede bloquear
    // Blob URLs para SVG, causando img.onerror silencioso y fallo de toda la escena.
    const dataURL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas);
        };
        img.onerror = () => {
            reject(new Error(`SVG→canvas falló (${w}×${h})`));
        };
        img.src = dataURL;
    });
}

function parseFloatSafe(s) {
    const v = parseFloat(s);
    return isNaN(v) ? null : v;
}
