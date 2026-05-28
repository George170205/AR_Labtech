# Libro de Colorear que Cobra Vida
### Documentación técnica completa — v1.1

---

## Tabla de contenidos

1. [Descripción del proyecto](#1-descripción-del-proyecto)
2. [Objetivos](#2-objetivos)
3. [Stack técnico](#3-stack-técnico)
4. [Prerrequisitos e instalación](#4-prerrequisitos-e-instalación)
5. [Estructura de carpetas](#5-estructura-de-carpetas)
6. [Arquitectura general](#6-arquitectura-general)
7. [Fase 1 — Captura y detección](#7-fase-1--captura-y-detección)
8. [Fase 2 — Identificación de colores](#8-fase-2--identificación-de-colores)
9. [Fase 3 — Animación](#9-fase-3--animación)
10. [Fase 4 — UX para niños](#10-fase-4--ux-para-niños)
11. [Sistema de templates SVG](#11-sistema-de-templates-svg)
12. [Flujo de datos completo](#12-flujo-de-datos-completo)
13. [Referencia: metadatos de animación SVG](#13-referencia-metadatos-de-animación-svg)
14. [Referencia: paleta de colores](#14-referencia-paleta-de-colores)
15. [Compatibilidad de navegadores](#15-compatibilidad-de-navegadores)
16. [Advertencias de rendimiento consolidadas](#16-advertencias-de-rendimiento-consolidadas)
17. [Ajustes y correcciones requeridos](#17-ajustes-y-correcciones-requeridos)
18. [Problemas conocidos y workarounds](#18-problemas-conocidos-y-workarounds)
19. [Decisiones de arquitectura](#19-decisiones-de-arquitectura)
20. [Roadmap — Mejoras futuras](#20-roadmap--mejoras-futuras)
21. [Registro de cambios — Changelog](#21-registro-de-cambios--changelog)

---

## 1. Descripción del proyecto

**Libro de Colorear que Cobra Vida** es una aplicación web progresiva que permite a un niño:

1. Colorear un contorno prediseñado en papel (dinosaurio, mariposa, pez, pájaro, etc.)
2. Apuntar la cámara del navegador hacia el papel coloreado
3. Ver cómo la app detecta y alinea la imagen con OpenCV.js
4. Ver cómo identifica con precisión los colores usados en cada zona
5. Ver cómo aplica esos colores exactos a una versión digital animada
6. El dibujo del niño "cobra vida" en pantalla con movimiento articulado

Todo corre en el navegador, sin backend, sin instalación nativa.

---

## 2. Objetivos

### Objetivo principal
Crear una experiencia mágica y accesible donde cualquier niño pueda ver su dibujo animado usando solo papel, lápices de colores y un teléfono o tablet con cámara.

### Objetivos técnicos
- Captura y rectificación de perspectiva en tiempo real con OpenCV.js (WASM)
- Identificación robusta de colores bajo condiciones de iluminación variables
- Corrección de iluminación usando los márgenes blancos del papel como referencia
- Animación articulada por zonas usando PixiJS con pivots por zona
- UX optimizada para niños: botones grandes, feedback sonoro, wizard lineal
- Funcionamiento offline (todos los templates embebidos en el bundle)
- Compartir y guardar la animación (Web Share API + MediaRecorder)

### Restricciones de diseño
- Sin backend — todo corre en el cliente
- Sin cámara de profundidad — solo RGB estándar
- Funcionar en móvil gama media (2GB RAM, GPU integrada)
- Niños de 5–12 años como usuarios primarios

---

## 3. Stack técnico

| Capa | Tecnología | Versión | Justificación |
|---|---|---|---|
| Framework UI | React | 18.3.x | Hooks, gestión de estado, re-renders eficientes |
| Build tool | Vite | 5.4.x | HMR rápido, soporte `?raw` para SVG |
| Visión por computadora | OpenCV.js | 4.8.0 | WASM, no requiere backend, detección de contornos |
| Machine Learning / colores | TensorFlow.js | 4.22.x | Cálculo matricial en WebGL para clasificación en espacio LAB |
| Renderizado / animación | PixiJS | 7.4.x | WebGL2, sprites articulados, Ticker eficiente |
| Síntesis de audio | Web Audio API | Nativa | Sin dependencias, generación de tones en runtime |
| Compartir / grabar | Web Share API + MediaRecorder | Nativas | Compartir en móvil, grabar video del canvas |
| Cámara | MediaDevices API | Nativa | Acceso a cámara trasera con constraints HD |

### Dependencias npm

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@tensorflow/tfjs": "^4.22.0",
    "pixi.js": "^7.4.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^5.4.10"
  }
}
```

> **Por qué no hay más dependencias:** OpenCV.js se carga desde CDN oficial en runtime. Los SVG templates se importan como strings (`?raw`). El sistema de partículas y los sonidos son implementaciones propias sin librerías.

---

## 4. Prerrequisitos e instalación

### Requisitos del entorno
- Node.js 18+ (recomendado 20 LTS)
- npm 9+ o pnpm 8+
- HTTPS en producción (requerido para `navigator.share`, `getUserMedia` y `captureStream`)
- Chrome 89+, Safari 15+, Firefox 90+ (ver matriz completa en §15)

### Instalación

```bash
# 1. Crear proyecto con Vite
npm create vite@latest libro-colorear -- --template react
cd libro-colorear

# 2. Instalar dependencias
npm install @tensorflow/tfjs pixi.js

# 3. Arrancar servidor de desarrollo
npm run dev
```

### Configuración del servidor de desarrollo

El archivo `vite.config.js` debe incluir las cabeceras CORS necesarias para WASM:

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

> **Por qué estas cabeceras:** OpenCV.js usa `SharedArrayBuffer` en algunas operaciones WASM. Sin estas cabeceras, el navegador bloquea el acceso. Son obligatorias en producción también (configurar en nginx/Vercel/Netlify).

---

## 5. Estructura de carpetas

```
libro-colorear/
│
├── index.html
├── vite.config.js
├── package.json
│
└── src/
    │
    ├── main.jsx                        ← Entry point React
    ├── App.jsx                         ← Wizard de 3 pasos (lógica global)
    ├── App.css                         ← Estilos globales, design system
    │
    ├── hooks/
    │   ├── useCamera.js                ← MediaDevices API, stream lifecycle
    │   ├── useOpenCV.js                ← Loader singleton OpenCV.js (WASM)
    │   ├── useTensorFlow.js            ← Loader singleton TF.js (WebGL backend)
    │   ├── useSoundFeedback.js         ← Síntesis Web Audio API, paleta de sonidos
    │   └── useWebShare.js              ← Web Share API + MediaRecorder + descarga
    │
    ├── utils/
    │   │
    │   │   ── Fase 1: Visión ──
    │   ├── paperDetector.js            ← Detección de papel con OpenCV (Canny + PolyDP)
    │   ├── perspectiveCorrector.js     ← Transformación homográfica (warpPerspective)
    │   │
    │   │   ── Fase 2: Colores ──
    │   ├── colorUtils.js               ← RGB↔LAB, paleta nombrada, ΔE76
    │   ├── illuminationCorrector.js    ← White Paper / Gray World / White Stretch
    │   ├── zoneExtractor.js            ← SVG masks → pixel coords, filtro de blancos
    │   ├── kMeansColor.js              ← K-means++ puro JS, k=3, init optimizado
    │   ├── colorClassifier.js          ← TF.js batch: distancias LAB → nombre de color
    │   └── colorAnalyzer.js            ← Orquestación completa de Fase 2
    │
    │       ── Fase 3: Animación ──
    │   ├── sceneBuilder.js             ← Construye escena PixiJS desde SVG + ZoneColorMap
    │   ├── animators.js                ← setupAnimations, buildAnimFn por tipo
    │   └── particleEffects.js          ← burstCelebration, startSparkles (pool)
    │
    ├── components/
    │   │
    │   │   ── Fase 1 ──
    │   ├── CameraCapture.jsx           ← Live feed, detección overlay, captura
    │   ├── CameraCapture.css
    │   │
    │   │   ── Fase 2 ──
    │   ├── ColorAnalyzer.jsx           ← Orquesta análisis, muestra ZoneColorCards
    │   ├── ColorAnalyzer.css
    │   ├── ZoneColorCard.jsx           ← Card por zona: swatch, clusters, ΔE, nombre
    │   │
    │   │   ── Fase 3 ──
    │   ├── AnimationScene.jsx          ← Canvas PixiJS, reveal, animaciones, controls
    │   ├── AnimationScene.css
    │   │
    │   │   ── Fase 4 ──
    │   ├── TemplateGallery.jsx         ← Galería de templates con preview SVG inline
    │   ├── TemplateGallery.css
    │   ├── OnboardingOverlay.jsx       ← Tutorial paso a paso (localStorage flag)
    │   ├── OnboardingOverlay.css
    │   ├── ShareModal.jsx              ← Guardar PNG / Web Share / Grabar video
    │   └── ShareModal.css
    │
    └── templates/
        ├── dinosaur.svg                ← 7 zonas: cola, cuerpo, cabeza, dorsal, patas, manchas
        ├── butterfly.svg               ← 6 zonas: 4 alas, cuerpo, manchas
        ├── fish.svg                    ← 6 zonas: cola, cuerpo, aletas, vientre, escamas
        └── bird.svg                    ← 6 zonas: cola, cuerpo, pecho, ala, cabeza, pico
```

---

## 6. Arquitectura general

### Wizard de 3 pasos (App.jsx)

```
┌──────────────────────────────────────────────────┐
│  PASO 0: Elige y colorea                         │
│  TemplateGallery → selección + descarga para     │
│  imprimir. OnboardingOverlay en primera visita.  │
└────────────────────┬─────────────────────────────┘
                     │ onSelect(template)
                     ▼
┌──────────────────────────────────────────────────┐
│  PASO 1: Escanea tu dibujo                       │
│  PrintGuide → instrucciones                       │
│  CameraCapture → detección de papel en vivo       │
│  Al capturar → automáticamente pasa a Paso 2     │
└────────────────────┬─────────────────────────────┘
                     │ onPaperCaptured(dataURL)
                     ▼
        [ColorAnalyzer corre en background]
        [Spinner amigable mientras analiza]
                     │ onAnalysisComplete(ZoneColorMap)
                     ▼
┌──────────────────────────────────────────────────┐
│  PASO 2: ¡Tu dibujo cobra vida!                  │
│  AnimationScene → reveal + animaciones + fx      │
│  ShareModal → PNG / Web Share / video WebM       │
└──────────────────────────────────────────────────┘
```

### Flujo interno de datos

```
MediaDevices API
    │ video frames
    ▼
useCamera hook → videoRef
    │
    ▼
CameraCapture (RAF loop, 60fps display / 250ms detección)
    │
    ├── OpenCV.js WASM
    │   ├── Grayscale → GaussianBlur → Canny → dilate
    │   ├── findContours → approxPolyDP → isContourConvex
    │   └── detectPaperCorners → [TL, TR, BR, BL]
    │
    └── warpPerspective → Imagen rectificada (PNG dataURL)
                │
                ▼
         ColorAnalyzer
                │
                ├── correctWhitePaper (borde del papel = referencia blanca)
                ├── extractZoneMasks (SVG → N canvas binarios)
                ├── extractZonePixels → filterColoredPixels
                ├── kMeansColors k=3 (JS puro)
                └── classifyColors (TF.js batch LAB ΔE)
                        │
                        ▼
                  ZoneColorMap
                  { zoneId: { rgb, hex, rawHex, name, deltaE } }
                        │
                        ▼
                 buildPixiScene
                        │
                        ├── renderZoneCanvas × N (en paralelo)
                        ├── renderContoursCanvas
                        └── PixiJS scene graph
                                │
                                ▼
                         setupAnimations
                         burstCelebration
                         startSparkles
```

---

## 7. Fase 1 — Captura y detección

### Objetivo
Acceder a la cámara, detectar el papel en tiempo real y rectificar la perspectiva para obtener una imagen plana y normalizada del dibujo coloreado.

### Archivos involucrados
| Archivo | Responsabilidad |
|---|---|
| `hooks/useCamera.js` | Gestiona el `MediaStream`: constraints, lifecycle, cleanup |
| `hooks/useOpenCV.js` | Loader singleton de OpenCV.js desde CDN |
| `utils/paperDetector.js` | Pipeline de visión: gris→blur→Canny→dilate→contornos→quad |
| `utils/perspectiveCorrector.js` | `warpPerspective` con `INTER_LINEAR` |
| `components/CameraCapture.jsx` | RAF loop, overlay de detección, botón de captura |

### Pipeline de detección de papel

```
Frame RGBA (640px max)
    │
    ├── cvtColor → GRAY
    ├── GaussianBlur (5×5, σ=0)
    ├── Canny (low=75, high=200)         ← umbrales empíricos para papel blanco
    ├── dilate (kernel 3×3, 2 iters)     ← cerrar gaps en bordes
    ├── findContours (RETR_EXTERNAL)
    └── approxPolyDP (ε = 2% perím.)    ← aproximar a polígono
            │
            ├── Filtro: exactamente 4 vértices
            ├── Filtro: isContourConvex = true
            ├── Filtro: área > 8% del frame
            └── Mejor candidato (mayor área)
                    │
                    └── orderCorners → [TL, TR, BR, BL]
```

### Corrección de perspectiva

```js
// El output de warpPerspective tiene las dimensiones reales del papel
// calculadas como el máximo de los lados opuestos detectados
outWidth  = max(dist(tl, tr), dist(bl, br))
outHeight = max(dist(tl, bl), dist(tr, br))

// Interpolación INTER_LINEAR: ~3× más rápido que INTER_LANCZOS4
// Cambiar a LANCZOS4 si los colores quedan pixelados en zonas pequeñas
cv.warpPerspective(src, warped, M, size, cv.INTER_LINEAR)
```

### Decisiones técnicas de Fase 1

| Decisión | Alternativa | Razón |
|---|---|---|
| Singleton loader para OpenCV | Cargar por componente | WASM pesa ~7MB, cargar una sola vez |
| Canvas de captura persistente (ref) | `createElement` en cada frame | Evitar presión sobre GC a 60fps |
| Throttle de detección a 250ms | Detectar cada frame | OpenCV en main thread es síncrono; sin throttle bloquea UI |
| Escalar frames a 640px max para CV | Procesar a resolución completa | La detección no necesita full-res; ~4× más rápido en móvil |
| Overlay canvas separado del live canvas | Dibujar sobre el live canvas | Permite separar presentación de debug sin artefactos |
| `RETR_EXTERNAL` en findContours | `RETR_LIST` o `RETR_TREE` | Solo necesitamos contornos externos; más rápido |

### Consideraciones de implementación

- **Gestión de memoria WASM:** `paperDetector.js` envuelve todo en `try/finally` con `.delete()` sobre cada `cv.Mat`, `cv.MatVector` y `cv.Mat.ones()`. `CameraCapture.jsx` también tiene `finally { mat.delete() }` en el loop principal para evitar memory leaks.
- **Robustez ante iluminación uniforme:** Se implementa `equalizeHist` antes de Canny para normalizar contraste, tres pasadas de Canny con umbrales distintos y múltiples valores de epsilon para `approxPolyDP`, haciéndolo resistente a bajo contraste.
- **Carga de OpenCV:** `onRuntimeInitialized` se define globalmente antes de insertar el `<script>` en el DOM para garantizar que se detecta la inicialización correctamente.
- **Rendimiento UI:** El throttle de `DETECT_INTERVAL = 250ms` implementado en `CameraCapture.jsx` evita que OpenCV en el hilo principal bloquee la interfaz.

### Advertencias de Fase 1 (Pendientes)

> **⚠️ `requestAnimationFrame` se pausa en background** — PENDIENTE
> Cuando el tab pierde el foco, los navegadores limitan o pausan RAF. El estado de detección puede quedar desincronizado. Implementar:
> ```js
> document.addEventListener('visibilitychange', () => {
>   if (document.hidden) cancelAnimationFrame(rafRef.current);
>   else rafRef.current = requestAnimationFrame(processFrame);
> });
> ```

---

## 8. Fase 2 — Identificación de colores

### Objetivo
Segmentar la imagen rectificada por zonas del SVG template, extraer el color dominante de cada zona, corregir la iluminación usando los márgenes blancos del papel como referencia, y clasificar cada color con un nombre legible en español.

### Archivos involucrados
| Archivo | Responsabilidad |
|---|---|
| `hooks/useTensorFlow.js` | Loader singleton de TF.js con auto-detección de backend |
| `utils/colorUtils.js` | RGB↔CIE LAB, paleta de 25 colores con precomputed LAB |
| `utils/illuminationCorrector.js` | White Paper Retinex, Gray World, White Stretch |
| `utils/zoneExtractor.js` | SVG → máscaras binarias por zona, filtro de píxeles |
| `utils/kMeansColor.js` | K-means++ puro JS, k=3, convergencia temprana |
| `utils/colorClassifier.js` | TF.js: distancias ΔE en batch [Z,P] → nombre de color |
| `utils/colorAnalyzer.js` | Orquestación del pipeline completo con progress callback |
| `components/ColorAnalyzer.jsx` | UI: progress bar, grid de ZoneColorCards, debug JSON |
| `components/ZoneColorCard.jsx` | Swatch exacto + clusters K-means + ΔE + confianza |

### Pipeline de análisis de color

```
Imagen rectificada (PNG dataURL)
    │
    ▼ correctWhitePaper(borderSize=30)
Corrección de iluminación
    │  Samplea borde del papel (píxeles de margen blanco)
    │  Percentil 90 por canal → referencia de blanco real
    │  Escala: corrected_R = pixel_R / ref_R × 255
    │
    ▼ extractZoneMasks(svgString, w, h)  [paralelo]
Máscaras binarias por zona
    │  Para cada <g data-zone="X">:
    │    Clona SVG → esta zona = blanco, resto = negro
    │    Renderiza a canvas → Uint8Array binario
    │
    ▼ extractZonePixels + filterColoredPixels
Píxeles filtrados (sin blanco, sin líneas de contorno)
    │  Excluir: brightness > 220 AND saturation < 20  (papel)
    │  Excluir: brightness < 45                       (líneas)
    │  Excluir: saturation < 12                       (grises)
    │  Submuestreo a max 3000 píxeles por zona
    │
    ▼ kMeansColors(pixels, k=3, iters=15)
Clusters dominantes por zona
    │  Inicialización K-means++
    │  Convergencia temprana si assignments no cambian
    │  Output: [{ rgb, count, ratio }] ordenado desc
    │
    ▼ classifyColors(tf, dominantRgbs, palette)  [batch TF.js]
Nombres de color
    │  zonesT: [Z, 3] en espacio LAB
    │  paletteT: [P, 3] en espacio LAB
    │  deltaE = sqrt(sum(square(zonesT.expandDims(1) - paletteT.expandDims(0)), 2))
    │  argMin → índice del color más cercano en paleta
    │
    ▼
ZoneColorMap
{ zoneId → { rgb, hex, rawHex, name, deltaE, confidence, clusters } }
```

### Corrección de iluminación — tres métodos

| Método | Cuándo usar | Ventaja | Riesgo |
|---|---|---|---|
| `correctWhitePaper` | **Default** — papel con márgenes visibles | Usa el blanco real del papel como referencia | Falla si los bordes están coloreados hasta el margen |
| `correctGrayWorld` | Imagen sin márgenes blancos visibles | No necesita área blanca | Ineficiente si hay mucho color saturado |
| `correctWhiteStretch` | Ambiente muy oscuro o imagen recortada | Maximiza el rango de colores | Puede saturar si hay reflejos especulares |

### Espacio de color LAB vs RGB

La clasificación de colores se hace en espacio **CIE LAB** y no en RGB porque:

- La distancia euclidiana en LAB (ΔE76) correlaciona con la percepción humana del color
- En RGB, azul y verde muy saturados pueden estar "cerca" numéricamente pero verse muy distintos
- LAB separa luminosidad (L) de cromaticidad (a, b) — la iluminación afecta L pero poco a y b
- ΔE < 10: colores indistinguibles o muy similares (confianza alta)
- ΔE 10–25: diferencia perceptible (confianza media)
- ΔE > 25: colores distintos (confianza baja — revisar iluminación)

### Decisiones técnicas de Fase 2

| Decisión | Alternativa | Razón |
|---|---|---|
| TF.js solo para clasificación, no K-means | TF.js para todo | K-means sobre ~3000 px con k=3 es trivial en JS; overhead WebGL no amortiza |
| K-means++ vs K-means aleatorio | Aleatorio | K-means++ converge en menos iteraciones y evita mínimos locales malos |
| SVG masks vs flood fill en imagen | Flood fill | Flood fill depende de bordes perfectos; SVG masks son exactas y reutilizables |
| White Paper Retinex vs Gray Card | Requiere hardware | El papel siempre tiene márgenes blancos — referencia integrada gratis |
| Percentil 90 vs máximo del borde | Máximo | Robusto ante sombras en esquinas o manchas residuales |

### Consideraciones de implementación

- **Compatibilidad iOS Safari:** `useTensorFlow.js` detecta dispositivos iOS (incluyendo iPad en modo desktop con `maxTouchPoints > 1`) y fuerza el uso del backend de CPU para TensorFlow.js para evitar fallos conocidos con el backend WebGL en estas plataformas.

### Advertencias de Fase 2 (Pendientes)

> **⚠️ `extractZoneMasks` bloquea el hilo principal ~1-2s** — PENDIENTE
> `zoneExtractor.js` procesa las máscaras de forma secuencial (`for...of` con `await` dentro). Nota: `sceneBuilder.js` sí usa `Promise.all` para el renderizado de zonas. Pendiente paralelizar también `extractZoneMasks`:
> ```js
> const entries = await Promise.all([...zoneEls].map(async (el) => {
>   const zoneId = el.getAttribute('data-zone');
>   const label = el.getAttribute('data-label') || zoneId;
>   const maskSvg = buildMaskSvg(svgRoot, zoneId, targetW, targetH);
>   const dataURL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(maskSvg);
>   const mask = await renderSvgToMask(dataURL, targetW, targetH);
>   return [zoneId, { mask, label }];
> }));
> return new Map(entries);
> ```

> **⚠️ Desalineación SVG↔imagen cuando el niño rota el papel** — PENDIENTE
> Si el papel está rotado >15° al capturar, las máscaras SVG no coinciden exactamente. La detección de color sigue funcionando (errores de borde son ~5-10% de píxeles). Para corrección exacta en v2: usar los vértices detectados en Fase 1 para transformar afínmente el SVG antes de generar las máscaras.

> **⚠️ Lápices vs ceras vs rotuladores — ajuste de umbrales** — PARCIALMENTE RESUELTO
> El selector de método de iluminación (`illuminationMethod`) ya está implementado en `colorAnalyzer.js` — `correctWhiteStretch` se puede activar para rotuladores brillantes. Los umbrales de brillo/saturación en `filterColoredPixels` siguen siendo hardcodeados; para colores pastel bajar el umbral de `brightness` de 220 a 235.

> **⚠️ Zona sin colorear vs zona con color muy claro** — PENDIENTE
> Si el niño usó colores muy pálidos (amarillo muy claro, rosa bebé), `filterColoredPixels` puede descartarlos y marcar la zona como `'uncolored'`. El umbral de `brightness > 220` es la causa. Bajar a 235 para pasteles, o hacer el umbral configurable por template.

---

## 9. Fase 3 — Animación

### Objetivo
Construir una escena PixiJS donde cada zona del SVG es un sprite independiente animado con su propio tipo de movimiento, usando los colores detectados en Fase 2. La escena incluye secuencia de reveal, animaciones articuladas, partículas de celebración y chispas continuas.

### Archivos involucrados
| Archivo | Responsabilidad |
|---|---|
| `utils/sceneBuilder.js` | Parsea SVG, renderiza N canvases en paralelo, construye scene graph |
| `utils/animators.js` | `setupAnimations`: un único Ticker callback para todas las zonas |
| `utils/particleEffects.js` | `burstCelebration` (confeti) + `startSparkles` (pool de 15 chispas) |
| `components/AnimationScene.jsx` | Canvas PixiJS, estados building/revealing/alive/paused |

### Arquitectura de la escena PixiJS

```
app.stage
└── root (Container, escalado y centrado en canvas 720×540)
    ├── bg (Graphics — rect blanco del papel)
    │
    ├── [zona_1] Sprite  ← cola
    │   pivot=(px, py), position=(px, py)
    │   alpha=0 hasta reveal
    │
    ├── [zona_2] Sprite  ← pata_trasera
    ├── [zona_3] Sprite  ← cuerpo
    ├── [zona_4] Sprite  ← manchas
    ├── [zona_5] Sprite  ← dorsal
    ├── [zona_6] Sprite  ← pata_delantera
    ├── [zona_7] Sprite  ← cabeza
    │
    ├── contoursSprite   ← líneas negras, siempre encima, estático
    │
    └── [particleContainer]  ← temporal, se destruye al terminar
```

### Tipos de animación disponibles

| Tipo | Fórmula | Uso típico |
|---|---|---|
| `swing` | `rotation = init_rot + sin(t·speed·2π + offset) · amplitude·DEG` | Cola, cabeza, patas |
| `breathe` | `scaleY = 1 + sin(t·speed·2π + offset) · amplitude` | Cuerpo |
| `float` | `y = init_y + sin(t·speed·2π + offset) · amplitude` | Dorsal, elementos flotantes |
| `walk` | Igual que `swing` con offset=π para sincronización alterna | Patas |
| `shimmer` | `alpha = 0.6 + ((1 + sin(t·speed·2π + offset)) / 2) · 0.4` | Manchas, detalles |

### Pivot points — cómo funciona la rotación articulada

```js
// Cada zona es un Sprite que cubre TODO el SVG (500×380px).
// Para rotar la cola alrededor de su base (px=70, py=230):

sprite.pivot.set(70, 230);    // punto de rotación en coords locales del sprite
sprite.position.set(70, 230); // coloca el pivot en ese punto del espacio padre

// Ahora sprite.rotation gira alrededor de (70,230) en world space.
// El sprite sigue cubriendo todo el SVG pero "aparece" en la misma posición
// que si no tuviera pivot — solo la rotación cambia el comportamiento visual.
```

### Secuencia de reveal

```
Para cada zona en REVEAL_ORDER = ['cuerpo', 'pata_trasera', ...]
  └── fadeIn(sprite, 380ms, ticker)   ← ease-out cúbico
      └── wait(220ms)
Finalmente:
  └── fadeIn(contoursSprite, 450ms)
      └── setPhase('alive')
              └── setupAnimations()
              └── burstCelebration()
              └── startSparkles()
```

### Decisiones técnicas de Fase 3

| Decisión | Alternativa | Razón |
|---|---|---|
| PixiJS v7 vs v8 | v8 | v8 cambió API de Graphics y Texture.from(); v7 más estable y documentado |
| PixiJS vs Lottie | Lottie | Lottie no permite modificar colores en runtime de forma simple; PixiJS da control total |
| Un Ticker callback global vs N callbacks | N callbacks | Un callback reduce overhead de dispatch del scheduler de PixiJS |
| `performance.now()` vs `delta` del Ticker | `delta` | `perf.now()` es tiempo absoluto → pausar/reanudar sin "saltos" en la animación |
| Sprites de zona = tamaño completo del SVG | Sprites recortados a la zona | Simplifica el sistema de pivots; texturas grandes son baratas en GPU moderna |
| Contornos como sprite estático encima | Contornos animados por zona | Evita complejidad; desalineación a 20° de amplitud es <5px, visualmente aceptable |
| Canvas fijo 720×540 + CSS scaling | `resizeTo` de PixiJS | Evita bugs de dimensionamiento al montar el componente React |
| Pool de 15 sprites para sparkles | Crear/destruir sprites | Evita alloc/GC continuo a 60fps |

### Consideraciones de implementación y diseño

- **Compatibilidad con React StrictMode:** Para evitar errores de contexto WebGL debido al montaje doble en desarrollo, se incluye un pequeño delay antes de crear la instancia de PixiJS y se usa `WEBGL_lose_context.loseContext()` en el cleanup para asegurar su liberación proactiva.
- **Destrucción segura de PixiJS:** El cleanup preserva el canvas del DOM usando `app.destroy(false, { children: true, texture: true, baseTexture: true })`, evitando artefactos visuales en el desmontaje.
- **Estilo visual de contornos:** La desalineación leve entre contornos estáticos y rellenos animados (ej. desfase de ~8px a 20° de amplitud) es una decisión de diseño que da un aspecto de "libro pop-up", evitando además duplicar las texturas en memoria.

### Advertencias de Fase 3 (Pendientes)

> **⚠️ Límite de texturas VRAM en iOS Safari** — PENDIENTE
> `AnimationScene.jsx` ya limita `resolution: Math.min(devicePixelRatio, 2)`, lo que reduce la carga de renderizado. Sin embargo, el tamaño de las texturas por zona (igual al viewBox del SVG) no se reduce en móvil. Para dispositivos de gama baja aplicar TEXTURE_SCALE en `sceneBuilder.js`:
> ```js
> const isMobile = /Mobi|Android/i.test(navigator.userAgent);
> const TEXTURE_SCALE = isMobile ? 0.5 : 1.0;
> const renderW = Math.round(svgW * TEXTURE_SCALE);
> const renderH = Math.round(svgH * TEXTURE_SCALE);
> ```

> **⚠️ `canvas.toDataURL()` bloquea el hilo ~80-150ms en canvas grande** — PENDIENTE
> `AnimationScene.jsx` y `App.jsx` siguen usando `toDataURL()` síncrono. Migrar a `toBlob()` asíncrono:
> ```js
> canvas.toBlob((blob) => {
>   const url = URL.createObjectURL(blob);
>   // descargar o pasar a ShareModal
> }, 'image/png');
> ```

---

## 10. Fase 4 — UX para niños

### Objetivo
Rediseñar la interfaz como un wizard lineal de 3 pasos optimizado para niños de 5-12 años: botones grandes, feedback sonoro, onboarding guiado, galería de templates y opciones de compartir/guardar.

### Archivos involucrados
| Archivo | Responsabilidad |
|---|---|
| `hooks/useSoundFeedback.js` | Web Audio API: tap, capture, success, celebrate, error, sparkle |
| `hooks/useWebShare.js` | Web Share API + MediaRecorder + descarga PNG |
| `components/TemplateGallery.jsx` | Preview SVG inline, descarga para imprimir, selección |
| `components/OnboardingOverlay.jsx` | Tutorial 5 pasos, localStorage flag, dots de progreso |
| `components/ShareModal.jsx` | Guardar PNG / Web Share / Grabar video 3.5s |
| `App.jsx` | Wizard: estado global, navegación, wiring entre fases |

### Sistema de sonidos

```
useSoundFeedback() → { play, toggle, enabled }

Paleta de sonidos:
  play('tap')       → 440Hz sine, 80ms    — cualquier acción de UI
  play('capture')   → 880+1320Hz, 200ms  — captura del papel
  play('success')   → Do-Mi-Sol-Do, 360ms — zona detectada
  play('celebrate') → arpegio ascendente + armónico, 500ms — animación live
  play('error')     → 350→280Hz sawtooth, 300ms — papel no detectado
  play('sparkle')   → 5 notas aleatorias, 300ms — reveal de zona
  play('step')      → 660→880Hz, 180ms   — avance de paso en wizard
```

> **Restricción de autoplay:** El `AudioContext` solo puede inicializarse después de un gesto del usuario (tap/click). El patrón lazy init garantiza esto. El primer `play('tap')` en `goTo()` activa el contexto para todos los sonidos posteriores.

### Compartir y grabar

```
useWebShare() → { canShare, canRecord, shareImage, downloadImage, recordCanvas }

shareImage(dataURL, title, text):
  Si navigator.canShare({ files }) → Web Share API
  Si no → descarga directa con <a download>

recordCanvas(pixiCanvas, 3500):
  Formato preferido: video/webm;codecs=vp9 → vp8 → webm → mp4
  captureStream(30fps) → MediaRecorder → Blob → ObjectURL
  No disponible en iOS Safari ≤16 (canRecord=false → botón oculto)
```

### Estándares de accesibilidad implementados

| Criterio | Implementación |
|---|---|
| WCAG 2.5.5 — Tamaño de tap target | `min-height: 48px`, `min-width: 48px` en todos los botones |
| Prevenir zoom automático iOS | `font-size: 16px` mínimo en inputs y body |
| `prefers-reduced-motion` | Si activo: se silencia el audio, se omiten animaciones largas |
| `touch-action: manipulation` | Eliminar delay de 300ms de doble-tap en iOS |
| Contraste | Variables CSS con contraste AA en todos los textos sobre fondo oscuro |
| Navegación con teclado | Todos los botones son `<button>` nativos o `<a>` con roles correctos |

### Consideraciones de implementación

- **Seguridad en `dangerouslySetInnerHTML`:** Se usa en `TemplateGallery` para mostrar SVGs de forma segura, ya que son assets propios del bundle. Si en el futuro se permiten templates subidos por el usuario, se deberá usar `DOMPurify` para sanitizarlos.
- **Fallback robusto para Web Share API:** `useWebShare.js` verifica la compatibilidad de `navigator.canShare` con archivos y hace un fallback automático a descarga directa `<a download>` si el entorno (ej. HTTP local o Firefox) no lo soporta.
- **Soporte condicional de captura de video:** La grabación se oculta de la UI automáticamente si `canvas.captureStream()` no está disponible (común en iOS Safari ≤16).
- **Resiliencia en LocalStorage:** El acceso al almacenamiento local para el tutorial de onboarding está protegido con bloques `try/catch` para prevenir crasheos en navegadores bajo modos de navegación privada estrictos.
- **Análisis en background:** `ColorAnalyzer` se monta intencionalmente con `display: none` en lugar de estar condicionado, permitiendo que sus `useEffect` ejecuten el análisis sin afectar el layout visual mientras se muestra el spinner.

*(Actualmente no hay advertencias críticas pendientes para la Fase 4)*

---

## 11. Sistema de templates SVG

### Estructura requerida de cada template

```svg
<svg viewBox="0 0 W H" xmlns="http://www.w3.org/2000/svg">

  <!-- Fondo blanco del papel (se oculta en renderizado de zona) -->
  <rect width="W" height="H" fill="white"/>

  <!-- Zonas — cada una tiene data-zone, data-label y metadata de animación -->
  <g data-zone="ZONE_ID"
     data-label="Nombre legible"
     data-pivot-x="PX"              <!-- X del punto de rotación en coords SVG -->
     data-pivot-y="PY"              <!-- Y del punto de rotación -->
     data-anim="TIPO"               <!-- swing|breathe|float|walk|shimmer -->
     data-anim-amplitude="N"        <!-- grados (swing/walk) | escala (breathe) | px (float) -->
     data-anim-speed="N"            <!-- ciclos por segundo -->
     data-anim-offset="N">          <!-- fase inicial en radianes -->
    <!-- Geometría SVG de la zona -->
    <ellipse ... fill="white" stroke="none"/>
  </g>

  <!-- ... más zonas ... -->

  <!-- Contornos — id="contornos" es el selector que usa sceneBuilder -->
  <!-- Sin fill, solo stroke negro. No tiene data-zone. -->
  <g id="contornos" fill="none" stroke="#1a1a1a" stroke-width="2.5"
     stroke-linejoin="round" stroke-linecap="round">
    <!-- Mismas geometrías que las zonas + detalles (ojos, boca, etc.) -->
  </g>

  <!-- Texto de pie de página (opcional, se oculta en rendering) -->
  <text ...>¡Colorea el ...</text>
</svg>
```

### Reglas de diseño de templates

1. **Las geometrías de zona no tienen `stroke`** — el stroke siempre viene de `#contornos`
2. **Cada zona debe estar en su propio `<g data-zone="...">`** — no mezclar zonas
3. **Las zonas pueden contener múltiples shapes** — todos comparten el mismo color
4. **Los contornos repiten exactamente las mismas geometrías** — con `stroke` y sin `fill`
5. **El `viewBox` define el sistema de coordenadas** — los pivots usan estas coordenadas
6. **Amplitude negativa en `swing`** invierte la dirección de rotación — útil para simetría (alas de mariposa)
7. **Las zonas deben solapar ligeramente** — evitar gaps visuales entre zonas adyacentes

### Templates disponibles

| Template | Archivo | Zonas | Zonas animadas |
|---|---|---|---|
| Dinosaurio | `dinosaur.svg` | 7 | cola(swing), cuerpo(breathe), cabeza(swing), dorsal(float), pata_trasera(walk), pata_delantera(walk), manchas(shimmer) |
| Mariposa | `butterfly.svg` | 6 | ala_sup_izq(swing, amp=-24), ala_sup_der(swing, amp=+24), ala_inf_izq(swing, amp=-16), ala_inf_der(swing, amp=+16), cuerpo(breathe), manchas(shimmer) |
| Pez | `fish.svg` | 6 | cola(swing), cuerpo(breathe), aleta_dorsal(float), aleta_pectoral(swing), vientre(breathe), escamas(shimmer) |
| Pájaro | `bird.svg` | 6 | cola(swing), cuerpo(breathe), pecho(breathe), ala(swing), cabeza(float), pico(swing) |

### Agregar un nuevo template

1. Diseñar el SVG siguiendo la estructura requerida (Inkscape, Illustrator, Figma)
2. Asignar `data-zone` a cada grupo de relleno
3. Definir pivots y tipo de animación por zona
4. Añadir entrada en el objeto `TEMPLATES` de `App.jsx`:
```js
import miTemplateSvg from './templates/mi-template.svg?raw';

const TEMPLATES = {
  // ...existentes...
  miAnimal: {
    label: 'Mi Animal',
    svg: miTemplateSvg,
    icon: '🐸',
    zones: 5,
  },
};
```
5. El sistema de Fases 2, 3 y 4 funciona automáticamente sin cambios adicionales.

---

## 12. Flujo de datos completo

```
┌─────────────────────────────────────────────────────────────┐
│                         App.jsx                              │
│                                                             │
│  state: step (0|1|2), template, capturedDataURL,            │
│          zoneColorMap, analyzing, showShare, frameDataURL   │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
  [PASO 0]              [PASO 1]              [PASO 2]
  TemplateGallery       CameraCapture         AnimationScene
         │                    │                    │
  onSelect(key)         onPaperCaptured       onSave(dataURL)
         │              (dataURL)                  │
         │                    │                    ▼
         │                    │             ShareModal
         │                    │             ├── downloadImage()
         │                    │             ├── shareImage()
         │                    │             └── recordCanvas()
         │                    │
         │                    ▼
         │             ColorAnalyzer [hidden]
         │             ├── correctWhitePaper()
         │             ├── extractZoneMasks()
         │             ├── filterColoredPixels()
         │             ├── kMeansColors()
         │             └── classifyColors() [TF.js]
         │                    │
         │             onAnalysisComplete(ZoneColorMap)
         │                    │
         │                    ▼
         │             AnimationScene
         │             ├── buildPixiScene()
         │             │   ├── renderZoneCanvas() × N [paralelo]
         │             │   └── renderContoursCanvas()
         │             ├── runReveal()
         │             │   └── fadeIn() × N [secuencial]
         │             ├── setupAnimations()
         │             ├── burstCelebration()
         │             └── startSparkles()
         │
  useSoundFeedback()   →   play('tap'|'capture'|'success'|'celebrate'|...)
  OnboardingOverlay    ↔   localStorage
```

### ZoneColorMap — estructura de salida de Fase 2 / entrada de Fase 3

```typescript
type ZoneColorMap = Map<string, ZoneResult>

type ZoneResult = {
  label:      string;         // Nombre legible ("Cola", "Cuerpo", etc.)
  status:     'colored'       // Zona con color detectado
            | 'uncolored'     // Zona sin colorear (píxeles muy claros o blancos)
            | 'error';        // Error durante el procesamiento

  // Solo si status === 'colored':
  rgb:        [number, number, number];  // Color dominante exacto [R, G, B]
  rawHex:     string;         // '#RRGGBB' del color detectado exacto
  hex:        string;         // '#RRGGBB' del color de paleta más cercano
  name:       string;         // Nombre en español ("azul", "rojo oscuro", etc.)
  deltaE:     number;         // Distancia ΔE76 al color de paleta (< 10 = confianza alta)
  confidence: 'alta'          // deltaE < 10
            | 'media'         // deltaE 10-25
            | 'baja';         // deltaE > 25
  clusters:   Array<{ rgb: [number,number,number], ratio: number }>;
  pixelCount:        number;  // Total de píxeles en la zona (máscara)
  coloredPixelCount: number;  // Píxeles que pasaron el filtro de color
}
```

---

## 13. Referencia: metadatos de animación SVG

| Atributo | Tipo | Descripción | Ejemplo |
|---|---|---|---|
| `data-zone` | `string` | ID único de la zona. Debe coincidir con ZONE_RENDER_ORDER si aplica. | `"cola"` |
| `data-label` | `string` | Nombre legible para la UI (ZoneColorCard) | `"Cola"` |
| `data-pivot-x` | `number` | X del punto de rotación en coords del viewBox | `70` |
| `data-pivot-y` | `number` | Y del punto de rotación en coords del viewBox | `230` |
| `data-anim` | `string` | Tipo de animación: `swing`, `breathe`, `float`, `walk`, `shimmer` | `"swing"` |
| `data-anim-amplitude` | `number` | Grados para swing/walk, fracción de escala para breathe, px para float. **Negativo invierte dirección.** | `-24` |
| `data-anim-speed` | `number` | Ciclos por segundo (Hz). `1.0` = un ciclo completo por segundo | `1.1` |
| `data-anim-offset` | `number` | Fase inicial en radianes. `π` (3.14159) = opuesto en fase | `3.14159` |

### Combinaciones comunes

```
Alas de mariposa sincronizadas:
  ala_izquierda: amplitude=-24, speed=1.1, offset=0
  ala_derecha:   amplitude=+24, speed=1.1, offset=0
  → Ambas suben y bajan juntas (simétricas)

Patas que caminan alternadas:
  pata_delantera: amplitude=18, speed=1.6, offset=0
  pata_trasera:   amplitude=18, speed=1.6, offset=3.14159 (=π)
  → Se alternan como al caminar real

Cabeza que asiente lento:
  cabeza: anim=swing, amplitude=7, speed=0.55, offset=1.4
  → Desfasada respecto al cuerpo para movimiento más orgánico
```

---

## 14. Referencia: paleta de colores

La paleta tiene 25 colores nominales. Los valores LAB se precomputan al inicializar `colorUtils.js`.

| Nombre | Hex | RGB |
|---|---|---|
| rojo | #DC3232 | 220, 50, 50 |
| rojo oscuro | #8B1A1A | 139, 26, 26 |
| naranja | #F07820 | 240, 120, 32 |
| amarillo | #FAD800 | 250, 216, 0 |
| amarillo claro | #FFFF66 | 255, 255, 102 |
| verde | #3CB43C | 60, 180, 60 |
| verde oscuro | #006400 | 0, 100, 0 |
| verde lima | #AADC00 | 170, 220, 0 |
| celeste | #64B4F0 | 100, 180, 240 |
| azul | #2850DC | 40, 80, 220 |
| azul oscuro | #00008B | 0, 0, 139 |
| morado | #8C3CC8 | 140, 60, 200 |
| violeta | #EE82EE | 238, 130, 238 |
| rosa | #F064B4 | 240, 100, 180 |
| rosa claro | #FFB6C1 | 255, 182, 193 |
| marrón | #825028 | 130, 80, 40 |
| marrón claro | #C4A070 | 196, 160, 112 |
| negro | #1E1E1E | 30, 30, 30 |
| gris | #969696 | 150, 150, 150 |
| gris claro | #D3D3D3 | 211, 211, 211 |
| blanco | #F0F0F0 | 240, 240, 240 |
| dorado | #FFD700 | 255, 215, 0 |
| turquesa | #40E0D0 | 64, 224, 208 |
| fucsia | #FF1493 | 255, 20, 147 |
| salmón | #FA8072 | 250, 128, 114 |

### Ampliar la paleta

Añadir entradas al array `RAW_PALETTE` en `colorUtils.js`. Cada entrada se convierte automáticamente a LAB en la inicialización del módulo. No se requiere cambio en el clasificador TF.js — el tensor de paleta se construye dinámicamente.

---

## 15. Compatibilidad de navegadores

| Feature | Chrome | Firefox | Safari | Edge | iOS Safari |
|---|---|---|---|---|---|
| `getUserMedia` (cámara) | ✅ 53+ | ✅ 36+ | ✅ 11+ | ✅ 79+ | ✅ 11+ |
| OpenCV.js WASM | ✅ 57+ | ✅ 52+ | ✅ 11+ | ✅ 79+ | ✅ 11+ |
| TF.js WebGL backend | ✅ | ✅ | ⚠️ bugs ≤16 | ✅ | ⚠️ bugs ≤16 |
| PixiJS v7 WebGL2 | ✅ | ✅ | ✅ 15+ | ✅ | ✅ 15+ |
| Web Share API (files) | ✅ 89+ | ❌ | ✅ 15+ | ✅ 89+ | ✅ 15+ |
| `canvas.captureStream()` | ✅ | ✅ | ✅ 17+ | ✅ | ❌ ≤16, ✅ 17+ |
| MediaRecorder video/webm | ✅ | ✅ | ❌ solo mp4 | ✅ | ❌ |
| Web Audio API | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SharedArrayBuffer` (WASM) | ✅ | ✅ | ✅ 15.2+ | ✅ | ✅ 15.2+ |

### Notas de compatibilidad críticas

- **iOS Safari ≤16**: TF.js debe usar backend CPU. `canRecord` será `false`. El resto funciona.
- **Firefox + Web Share**: No soporta `navigator.share({ files })`. Hace fallback a descarga PNG automáticamente.
- **Safari + MediaRecorder**: Solo soporta `video/mp4`. `useWebShare.js` detecta el mime type soportado automáticamente.
- **HTTP en desarrollo**: `getUserMedia` requiere HTTPS o `localhost`. Usar `vite --host 0.0.0.0` en localhost.

---

## 16. Advertencias de rendimiento consolidadas

### Memoria

| Problema | Impacto | Solución |
|---|---|---|
| OpenCV Mats sin `.delete()` | Crash en ~2min de uso | Siempre usar `try/finally { mat.delete() }` |
| N texturas PixiJS grandes en iOS | VRAM overflow (crash) | Escalar texturas ×0.5 en móvil |
| Partículas sin cleanup | Sprites huérfanos acumulados | El sistema auto-destruye cuando `alive===0` |
| Canvas de captura creado en cada frame | GC pressure a 60fps | Un canvas persistente (ref) reutilizable |

### CPU / GPU

| Problema | Impacto | Solución |
|---|---|---|
| OpenCV en main thread | Bloquea UI 30-50ms | Throttle 250ms; usar Web Worker en Fase 2 extendida |
| TF.js init en iOS CPU backend | Lento (~3s) | Mostrar spinner; lazy load con `import()` |
| PixiJS `resolution = devicePixelRatio` | 3× píxeles en iPhone 14 Pro | Limitar a `Math.min(dpr, 2)` |
| `canvas.toDataURL()` síncrono | Bloquea UI 80-150ms | Usar `canvas.toBlob()` asíncrono |
| RAF en background tab | CPU wasted | Pausar en `visibilitychange` |

### Red

| Problema | Impacto | Solución |
|---|---|---|
| OpenCV.js desde CDN = ~7MB | Primera carga lenta | Mostrar progress spinner; pre-cargar en ServiceWorker |
| TF.js = ~3MB | Bloquea interacción | Dynamic import(), carga lazy |
| PixiJS = ~1.5MB | Aumenta bundle | Tree-shaking con `import { Sprite } from 'pixi.js'` |

---

## 17. Ajustes y correcciones pendientes

Los siguientes cambios están pendientes de implementación para optimizar la compatibilidad y funcionalidad.

### 17.1 — ⚠️ iOS Safari: forzar CPU backend en TF.js

```js
// src/hooks/useTensorFlow.js — actualizar loadTensorFlow():
export function loadTensorFlow() {
  if (tfPromise) return tfPromise;
  tfPromise = import('@tensorflow/tfjs').then(async (tf) => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      await import('@tensorflow/tfjs-backend-cpu');
      await tf.setBackend('cpu');
    }
    await tf.ready();
    console.info(`[TF.js] backend: ${tf.getBackend()}`);
    return tf;
  });
  return tfPromise;
}
```

Y añadir la dependencia:
```bash
npm install @tensorflow/tfjs-backend-cpu
```

### 17.2 — ⚠️ `localStorage` en modo privado de Safari

```js
// src/components/OnboardingOverlay.jsx — envolver accesos:
function getOnboarded() {
  try { return localStorage.getItem(STORAGE_KEY); }
  catch { return null; }
}

function setOnboarded() {
  try { localStorage.setItem(STORAGE_KEY, '1'); }
  catch { /* silenciar en modo privado */ }
}
```

### 17.3 — ⚠️ `touch-action: manipulation` global

```css
/* src/App.css — añadir al reset */
button, a, [role="button"] {
  touch-action: manipulation; /* elimina delay 300ms doble-tap en iOS */
}
```

### 17.4 — ⚠️ `ColorAnalyzer` selector de método de iluminación

El componente `ColorAnalyzer.jsx` expone un `<select>` para elegir el método de corrección, pero `colorAnalyzer.js` actualmente siempre usa `correctWhitePaper`. Pasar el método como opción:

```js
// colorAnalyzer.js — añadir parámetro:
export async function analyzeColors(tf, capturedDataURL, svgTemplate, {
  onProgress,
  illuminationMethod = 'whitePaper'  // ← AÑADIR
} = {}) {
  // ...
  const corrected = {
    whitePaper:   () => correctWhitePaper(imageData, 30),
    grayWorld:    () => correctGrayWorld(imageData),
    whiteStretch: () => correctWhiteStretch(imageData, 95),
  }[illuminationMethod]?.() ?? correctWhitePaper(imageData, 30);
  // ...
}
```

### 17.5 — ⚠️ `useCamera.js`: `videoWidth` puede ser 0 en primer render

```js
// Algunos navegadores no tienen videoWidth disponible en 'loadedmetadata'.
// Esperar al evento 'loadeddata' como fallback:
await new Promise((resolve) => {
  if (video.videoWidth > 0) { resolve(); return; }
  video.onloadeddata = resolve;
  video.onloadedmetadata = () => {
    if (video.videoWidth > 0) resolve();
  };
});
```

### 17.6 — ⚠️ Cabeceras CORS en producción (solo necesario al desplegar)

Para despliegue en **Vercel** (`vercel.json`):
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy",   "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

Para **Netlify** (`netlify.toml`):
```toml
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
```

Para **nginx**:
```nginx
add_header Cross-Origin-Opener-Policy "same-origin";
add_header Cross-Origin-Embedder-Policy "require-corp";
```

---

## 18. Problemas conocidos y workarounds

| Estado | Problema | Causa raíz | Workaround / Solución |
|---|---|---|---|
| ⚠️ Abierto | Papel no detectado sobre mesa clara | Bajo contraste borde-fondo en Canny | Usar superficie oscura o aumentar `epsilon` en `approxPolyDP` a 3-4% |
| ⚠️ Abierto | Colores pastel no detectados | `filterColoredPixels` demasiado estricto | Subir umbral `brightness` de 220 a 235 |
| ⚠️ Abierto | Cámara pide permiso dos veces (StrictMode) | React monta dos veces en dev | Normal en dev, no ocurre en producción |
| ⚠️ Abierto | TF.js lento primera vez en iOS | Backend CPU sin aceleración | Mostrar spinner con mensaje "Preparando..." |
| ⚠️ Abierto | SVG preview en TemplateGallery no respeta aspect-ratio | CSS del thumbnail | Añadir `preserveAspectRatio="xMidYMid meet"` al SVG si falta |
| ⚠️ Abierto | Web Share falla en desktop Chrome | La API requiere gesto del usuario + HTTPS | El `useWebShare` ya hace fallback a descarga; comportamiento esperado |
| ⚠️ Abierto | Video guardado no se abre en WhatsApp/galería Android | MediaRecorder genera WebM; WhatsApp y galería de Android no lo soportan bien | Guardar como PNG es la alternativa funcional; el video solo se reproduce en el navegador |

> **Nota:** Los problemas resueltos previamente en iteraciones anteriores de desarrollo han sido movidos a la sección **21. Registro de cambios — Changelog**.

---

## 19. Decisiones de arquitectura

### ¿Por qué no usar un modelo ML preentrenado para todo el pipeline de color?

Un modelo de clasificación de imágenes (MobileNet, EfficientNet) podría identificar colores directamente. Se descartó porque:
1. Requiere descarga de pesos (~4MB adicionales)
2. Es una caja negra sin explicabilidad (no podemos saber por qué clasificó "azul" si el resultado es incorrecto)
3. No maneja bien la corrección de iluminación
4. El pipeline actual (K-means + LAB + ΔE) es interpretable, ajustable y más robusto para el caso de uso

### ¿Por qué SVG con capas nombradas en lugar de flood fill?

Flood fill sobre la imagen capturada requeriría que:
1. Los bordes de contorno sean perfectos en la imagen (no siempre es el caso con lápices)
2. Implementar un algoritmo de seed selection (¿dónde empieza el fill?)
3. Gestionar zonas discontinuas

Las máscaras SVG son exactas, reutilizables entre capturas y permiten nombrar las zonas desde el diseño.

### ¿Por qué PixiJS y no Canvas API puro?

Canvas API puro requeriría implementar:
- Gestión de capas (Z-order)
- Transformaciones afines con pivots arbitrarios
- Compositing de sprites
- Loop de animación robusto

PixiJS lo provee todo con aceleración WebGL2 y una API probada en producción. El costo es +1.5MB en el bundle.

### ¿Por qué no Lottie para la animación?

Lottie requiere animaciones diseñadas en After Effects exportadas como JSON. No permite:
1. Modificar colores en runtime de forma simple (requiere manipulación del JSON de animación)
2. Animar con datos dinámicos (los colores del niño)

PixiJS permite aplicar cualquier color a cualquier sprite en cualquier momento.

### ¿Por qué Web Audio API sin librería (Tone.js, Howler)?

Los sonidos del juego son simples (osciladores + envolventes). El overhead de Tone.js (~200KB) no se justifica para 8 sonidos sintetizados en tiempo real. La implementación propia es ~3KB.

---

## 20. Roadmap — Mejoras futuras

### v1.1 — Rendimiento
- [ ] Migrar procesamiento OpenCV a **Web Worker** (Comlink) para no bloquear main thread
- [ ] Implementar **Service Worker** para offline caching de OpenCV.js y TF.js
- [ ] Pool de texturas PixiJS para reutilizar entre renderizados
- [ ] Lazy load de TF.js solo cuando se llega a Fase 2

### v1.2 — Detección robusta
- [ ] Marcadores **ArUco** en las esquinas del template para detección resistente a mala iluminación
- [ ] **Fine-alignment** SVG↔imagen usando los vértices detectados de Fase 1
- [ ] Calibración automática de umbrales de `filterColoredPixels` por tipo de material (lápiz/cera/rotulador)
- [ ] Modo de re-captura parcial: solo re-analizar la zona que el niño cambió de color

### v1.3 — Nuevos templates y animaciones
- [ ] Template **cohete** con llamas animadas (partículas de fuego)
- [ ] Template **dragón** con efecto de respirar fuego (shader custom)
- [ ] Template **robot** con movimiento mecánico (animación escalonada)
- [ ] **Editor de templates** en el navegador: cargar SVG propio y asignar zonas visualmente

### v1.4 — Experiencia
- [ ] **Narración por voz** con Web Speech Synthesis API al revelar cada zona ("¡Tu dinosaurio es verde!")
- [ ] **Modo multijugador local**: dos niños colorean partes distintas del mismo template
- [ ] **Galería de creaciones**: guardar en IndexedDB + visualizar colecciones
- [ ] **Modo impresión** optimizado: CSS `@media print` para que el template se imprima correctamente desde el navegador sin descarga

### v2.0 — Machine Learning avanzado
- [ ] Modelo de corrección de color entrenado con datos reales (lápices bajo distintas iluminaciones) usando TF.js Transfer Learning
- [ ] Segmentación automática por flood fill (sin necesidad de SVG template) para dibujos libres
- [ ] Detección de trazo (cuánta presión aplicó el niño) para ajustar saturación del color en la animación

---

---

## 21. Registro de cambios — Changelog

### v1.1 — Mayo 2026 (sesión de debugging)

Esta versión corrige 6 bugs críticos descubiertos durante la prueba en dispositivo real (Chrome Android, template mariposa). El pipeline completo captura → análisis de color → animación PixiJS quedó funcional.

#### Bugs corregidos

**Bug 1 — Máscaras SVG idénticas (análisis de color completamente erróneo)**
- **Archivo:** `src/utils/zoneExtractor.js` → `buildMaskSvg()`
- **Causa:** Los elementos hijo de cada `<g data-zone>` (p.ej. `<ellipse fill="white">`) tenían el atributo de presentación `fill="white"`. En CSS, los atributos de presentación tienen menor prioridad que los estilos inline, pero mayor que los heredados. Al poner `el.style.fill = 'black'` solo en el `<g>` padre, los hijos mantenían su `fill="white"` original, haciendo que todas las máscaras fueran blancas (idénticas).
- **Fix:** Iterar todos los hijos y aplicar `child.style.fill = 'black'` explícitamente.
- **Síntoma visible:** El debug mostraba `6/6 zonas` coloreadas aunque el papel estuviera en blanco (todas las zonas recibían el mismo color promedio de la imagen completa).

**Bug 2 — Blob URLs fallan silenciosamente en Chrome móvil con HTTPS**
- **Archivos:** `src/utils/zoneExtractor.js` y `src/utils/sceneBuilder.js`
- **Causa:** `URL.createObjectURL(blob)` para SVGs puede fallar sin error en Chrome Android bajo HTTPS por restricciones de seguridad de Content Security Policy.
- **Fix:** Reemplazar por `'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr)`.
- **Síntoma visible:** `img.onerror` se disparaba silenciosamente, `buildPixiScene` rechazaba la promesa y `AnimationScene` pasaba a estado `'error'`.

**Bug 3 — Error "No se pudo iniciar la animación" por contexto WebGL no liberado**
- **Archivo:** `src/components/AnimationScene.jsx`
- **Causa:** React StrictMode monta los `useEffect` dos veces (monta → cleanup → monta). Chrome Android no libera el slot de contexto WebGL de forma síncrona al llamar `app.destroy()`. El segundo `new PIXI.Application()` lanzaba excepción al no encontrar un slot disponible.
- **Fix:** (1) Añadir 120ms de delay antes de crear el app; (2) llamar `WEBGL_lose_context.loseContext()` en el cleanup para forzar la liberación; (3) reintentar con `forceCanvas: true` si WebGL sigue fallando.
- **Síntoma visible:** Pantalla con fondo oscuro, sin animación, mensaje de error rojo.

**Bug 4 — Overlay de error invisible detrás del canvas**
- **Archivo:** `src/components/AnimationScene.css`
- **Causa:** `.as-canvas` tenía `z-index: 1` pero `.as-overlay` no tenía `z-index` definido (valor `auto`). El canvas cubría visualmente el overlay de error aunque estuviera en el DOM.
- **Fix:** Añadir `z-index: 5` a `.as-overlay`.
- **Síntoma visible:** El debug label mostraba `error · 6/6 zonas` pero no había texto de error visible, solo fondo marrón.

**Bug 5 — Canvas recortado en esquina del teléfono (animación visible solo parcialmente)**
- **Archivo:** `src/components/AnimationScene.css`
- **Causa:** PixiJS con `autoDensity: true` pone `style="width: 720px; height: 540px"` directamente en el elemento `<canvas>`. Los estilos inline tienen mayor especificidad que las reglas de clase CSS, así que `width: 100%` definido en `.as-canvas` era ignorado. En un teléfono con viewport de ~400px, el canvas de 720px sobresalía del contenedor.
- **Fix:** Añadir `!important` a las propiedades `width` y `height` de `.as-canvas`.
- **Síntoma visible:** Solo se veía una pequeña porción de la mariposa en la esquina inferior derecha del área de animación.

**Bug 6 — Nombre de archivo hardcodeado al guardar**
- **Archivos:** `src/components/AnimationScene.jsx` y `src/App.jsx`
- **Causa:** El nombre del archivo PNG guardado estaba hardcodeado como `"dinosaurio-cobra-vida.png"` independientemente del template activo.
- **Fix:** Añadir prop `templateLabel` a `AnimationScene` y usarlo dinámicamente: `` `${templateLabel.toLowerCase()}-cobra-vida.png` ``.

**Bug 7 — `canvas.toDataURL()` devuelve imagen en negro al guardar captura**
- **Archivo:** `src/components/AnimationScene.jsx`
- **Causa:** PixiJS usa `preserveDrawingBuffer: false` por defecto para optimizar rendimiento. Al intentar capturar el canvas con `toDataURL` después de renderizar, el buffer se ha limpiado y devuelve una imagen completamente negra.
- **Fix:** Añadir la opción `preserveDrawingBuffer: true` al inicializar la instancia de `PIXI.Application`.

---

*Documentación generada para el proyecto Libro de Colorear que Cobra Vida.*
*Stack: React 18 + Vite 5 + OpenCV.js 4.8 + TensorFlow.js 4.22 + PixiJS 7.4*
*v1.0 — Abril 2026 | v1.1 — Mayo 2026 (debugging y corrección de pipeline completo)*
