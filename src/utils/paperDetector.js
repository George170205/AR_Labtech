// El papel debe ocupar al menos el 4% del área del frame.
// Bajar si los niños capturan desde lejos; subir para evitar falsos positivos.
const MIN_AREA_RATIO = 0.04;

// ─── ML Fallback (TensorFlow.js) ────────────────────────────────────────────
// El modelo ML se usa cuando OpenCV no encuentra contornos (fondos claros,
// iluminación difícil). Carga lazy la primera vez que se necesita.

const ML_MODEL_URL  = '/paper-detector-model/model.json';
const ML_IMG_SIZE   = 224;
const ML_THRESHOLD  = 0.6;

let _mlModel    = null;   // tf.LayersModel cargado
let _mlLoading  = false;  // evitar cargas paralelas
let _mlReady    = false;  // true cuando el modelo está listo
let _mlFailed   = false;  // true si la carga falló (no reintentar)

/**
 * Precarga el modelo ML en segundo plano.
 * Llama esto al iniciar la app para que la primera detección no tenga latencia.
 */
export async function preloadPaperDetectorML() {
    if (_mlReady || _mlLoading || _mlFailed) return;
    _mlLoading = true;
    try {
        const tf = await import('@tensorflow/tfjs');
        // Verificar que el archivo existe antes de cargar
        const res = await fetch('/paper-detector-model/model.json');
        if (!res.ok) {
            _mlFailed = true;
            _mlLoading = false;
            return;
        }
        _mlModel = await tf.loadLayersModel(ML_MODEL_URL);
        // Warm-up: una predicción en blanco para compilar kernels
        const dummy = tf.zeros([1, ML_IMG_SIZE, ML_IMG_SIZE, 3]);
        await _mlModel.predict(dummy).data();
        dummy.dispose();
        _mlReady = true;
        console.log(`[paperDetector] Modelo ML cargado — accuracy: ${(0.9583 * 100).toFixed(1)}% | umbral: ${ML_THRESHOLD}`);
    } catch (e) {
        _mlFailed = true;
        console.warn('[paperDetector] Modelo ML no disponible:', e.message);
    } finally {
        _mlLoading = false;
    }
}

/**
 * Usa el modelo ML para determinar si hay papel en el frame.
 * @param {HTMLVideoElement|HTMLCanvasElement} source  Fuente de imagen
 * @returns {Promise<boolean>}
 */
async function mlHasPaper(source) {
    if (!_mlReady || !_mlModel) return false;
    const tf = await import('@tensorflow/tfjs');

    return tf.tidy(() => {
        // Leer píxeles desde el elemento de vídeo/canvas
        const tensor = tf.browser.fromPixels(source)
            .resizeBilinear([ML_IMG_SIZE, ML_IMG_SIZE])
            .toFloat()
            .div(255.0)
            .expandDims(0);              // [1, 224, 224, 3]

        const prob = _mlModel.predict(tensor).dataSync()[0];
        return prob >= ML_THRESHOLD;
    });
}

const CANNY_PASSES = [
    [75, 200],
    [50, 150],
    [30, 100],
];

const APPROX_EPSILONS = [0.02, 0.03, 0.04, 0.06];

/**
 * Detecta el papel rectangular en un cv.Mat RGBA.
 *
 * Pipeline:
 *   RGBA → Gris → Blur gaussiano → Canny → Dilatación → Contornos → PolyDP
 *
 * @param {object} cv   Instancia de OpenCV.js
 * @param {cv.Mat} src  Mat de entrada (RGBA, CV_8UC4)
 * @returns {Array<{x,y}>|null}  [TL, TR, BR, BL] en coords del Mat, o null
 */
export function detectPaperCorners(cv, src) {
    const gray = new cv.Mat();
    const equalized = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    const dilated = new cv.Mat();
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);

    try {
        // 1. Escala de grises
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        // 2. Ecualizar + blur para mejorar bordes con luz irregular.
        cv.equalizeHist(gray, equalized);
        cv.GaussianBlur(equalized, blurred, new cv.Size(5, 5), 0);

        const minArea = src.rows * src.cols * MIN_AREA_RATIO;
        let bestApprox = null;
        let bestArea = 0;

        for (const [low, high] of CANNY_PASSES) {
            edges.setTo(new cv.Scalar(0));
            dilated.setTo(new cv.Scalar(0));

            const passContours = new cv.MatVector();
            const passHierarchy = new cv.Mat();

            // 3. Canny con varios umbrales: hojas sobre fondos brillantes
            // o con sombras necesitan una pasada más sensible.
            cv.Canny(blurred, edges, low, high);

            // 4. Dilatar para cerrar gaps del borde del papel.
            cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2);

            cv.findContours(
                dilated,
                passContours,
                passHierarchy,
                cv.RETR_LIST,
                cv.CHAIN_APPROX_SIMPLE,
            );

            for (let i = 0; i < passContours.size(); i++) {
                const cnt = passContours.get(i);
                try {
                    const area = cv.contourArea(cnt);
                    if (area < minArea) continue;

                    const peri = cv.arcLength(cnt, true);
                    for (const epsilon of APPROX_EPSILONS) {
                        const approx = new cv.Mat();
                        cv.approxPolyDP(cnt, approx, epsilon * peri, true);

                        if (isGoodPaperQuad(cv, approx, area, src.cols, src.rows)) {
                            if (area > bestArea) {
                                bestApprox?.delete();
                                bestApprox = approx;
                                bestArea = area;
                            } else {
                                approx.delete();
                            }
                            break;
                        }

                        approx.delete();
                    }
                } finally {
                    cnt.delete();
                }
            }

            passContours.delete();
            passHierarchy.delete();
        }

        if (!bestApprox) return null;

        const pts = Array.from({ length: 4 }, (_, i) => ({
            x: bestApprox.data32S[i * 2],
            y: bestApprox.data32S[i * 2 + 1],
        }));

        bestApprox.delete();
        return orderCorners(pts);
    } finally {
        // Liberar SIEMPRE — OpenCV.js no tiene GC automático
        gray.delete();
        equalized.delete();
        blurred.delete();
        edges.delete();
        dilated.delete();
        kernel.delete();
    }
}

function isGoodPaperQuad(cv, approx, area, frameW, frameH) {
    if (approx.rows !== 4) return false;
    if (!cv.isContourConvex(approx)) return false;

    const pts = Array.from({ length: 4 }, (_, i) => ({
        x: approx.data32S[i * 2],
        y: approx.data32S[i * 2 + 1],
    }));

    const ordered = orderCorners(pts);
    const [tl, tr, br, bl] = ordered;
    const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const width = Math.max(dist(tl, tr), dist(bl, br));
    const height = Math.max(dist(tl, bl), dist(tr, br));
    const aspect = width > height ? width / height : height / width;
    const frameArea = frameW * frameH;

    // Evitar líneas largas, objetos demasiado panorámicos y casi todo el frame.
    if (aspect < 1.05 || aspect > 2.5) return false;
    if (area > frameArea * 0.92) return false;

    return true;
}

/**
 * Ordena 4 puntos arbitrarios como [TL, TR, BR, BL].
 *
 * Propiedad geométrica usada:
 *   - TL tiene la menor suma x+y
 *   - BR tiene la mayor suma x+y
 *   - TR tiene la mayor diferencia x-y
 *   - BL tiene la menor diferencia x-y
 *
 * Esto falla si la imagen está rotada >45°, pero para captura con cámara
 * horizontal el papel siempre estará dentro de ese rango.
 */
function orderCorners(pts) {
    const sum = (p) => p.x + p.y;
    const diff = (p) => p.x - p.y;

    return [
        pts.reduce((a, b) => (sum(a) < sum(b) ? a : b)),   // TL
        pts.reduce((a, b) => (diff(a) > diff(b) ? a : b)), // TR
        pts.reduce((a, b) => (sum(a) > sum(b) ? a : b)),   // BR
        pts.reduce((a, b) => (diff(a) < diff(b) ? a : b)), // BL
    ];
}

// ─── API combinada OpenCV + ML ────────────────────────────────────────────────

/**
 * Detecta papel usando OpenCV primero; si no encuentra nada, usa el modelo ML.
 *
 * @param {object} cv          Instancia de OpenCV.js
 * @param {cv.Mat} src         Mat de entrada (RGBA, CV_8UC4)
 * @param {HTMLVideoElement|HTMLCanvasElement} [videoSource]
 *   Fuente para el fallback ML. Si se omite, solo se usa OpenCV.
 * @returns {Promise<{corners: Array<{x,y}>|null, method: 'opencv'|'ml'|'none'}>}
 */
export async function detectPaper(cv, src, videoSource = null) {
    // 1. Intento rápido con OpenCV (síncrono)
    const corners = detectPaperCorners(cv, src);
    if (corners) return { corners, method: 'opencv' };

    // 2. Fallback ML si hay fuente de vídeo disponible
    if (videoSource && _mlReady) {
        const hasPaper = await mlHasPaper(videoSource);
        if (hasPaper) {
            // El modelo confirma que hay papel pero OpenCV no pudo delimitarlo.
            // Devolvemos null corners para que el caller muestre un hint visual
            // en lugar de intentar hacer perspectiva sin esquinas.
            return { corners: null, method: 'ml' };
        }
    }

    return { corners: null, method: 'none' };
}
