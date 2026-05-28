# PROMPT — Libro de Colorear que Cobra Vida v2.0

---

## CONTEXTO DEL PROYECTO

Eres un asistente experto en desarrollo frontend y machine learning trabajando en **"Libro de Colorear que Cobra Vida"**, una aplicación web progresiva (PWA) sin backend que permite a niños de 5–12 años:

1. Colorear un contorno prediseñado en papel
2. Apuntar la cámara del teléfono al papel coloreado
3. Ver cómo la app detecta el papel, identifica los colores y anima el dibujo en pantalla con los colores exactos que usó el niño

Todo corre 100% en el navegador. No hay servidor. No hay instalación nativa.

---

## STACK TÉCNICO ACTUAL (v1.1 — YA IMPLEMENTADO)

```
React 18.3 + Vite 5.4
OpenCV.js 4.8    → detección de papel y rectificación de perspectiva (WASM)
TensorFlow.js 4.22 → clasificación de colores en espacio LAB
PixiJS 7.4       → animación articulada con WebGL2
Web Audio API    → feedback sonoro sintetizado
MediaDevices API → acceso a cámara trasera
Web Share API + MediaRecorder → compartir y grabar
```

### Dependencias npm actuales
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

---

## ESTRUCTURA DE ARCHIVOS ACTUAL (v1.1)

```
src/
├── main.jsx
├── App.jsx                      ← Wizard 3 pasos, estado global
├── App.css
├── hooks/
│   ├── useCamera.js             ← MediaDevices API, stream lifecycle
│   ├── useOpenCV.js             ← Singleton loader OpenCV WASM
│   ├── useTensorFlow.js         ← Singleton loader TF.js + backend iOS fix
│   ├── useSoundFeedback.js      ← Web Audio API, 7 sonidos sintetizados
│   └── useWebShare.js           ← Web Share + MediaRecorder + descarga PNG
├── utils/
│   ├── paperDetector.js         ← Canny + approxPolyDP + filtros
│   ├── perspectiveCorrector.js  ← warpPerspective INTER_LINEAR
│   ├── colorUtils.js            ← RGB↔LAB, paleta 25 colores, ΔE76
│   ├── illuminationCorrector.js ← White Paper / Gray World / White Stretch
│   ├── zoneExtractor.js         ← SVG masks → pixel coords
│   ├── kMeansColor.js           ← K-means++ puro JS, k=3
│   ├── colorClassifier.js       ← TF.js batch LAB ΔE → nombre de color
│   ├── colorAnalyzer.js         ← Orquestación Fase 2
│   ├── sceneBuilder.js          ← Construye escena PixiJS desde SVG
│   ├── animators.js             ← Un Ticker callback global
│   └── particleEffects.js       ← Confeti + pool de chispas
├── components/
│   ├── CameraCapture.jsx        ← RAF loop, overlay OpenCV, captura
│   ├── ColorAnalyzer.jsx        ← Orquesta análisis, muestra ZoneColorCards
│   ├── ZoneColorCard.jsx        ← Swatch + clusters K-means + ΔE
│   ├── AnimationScene.jsx       ← Canvas PixiJS, reveal, controles
│   ├── TemplateGallery.jsx      ← Galería con preview SVG inline
│   ├── OnboardingOverlay.jsx    ← Tutorial 5 pasos (localStorage flag)
│   └── ShareModal.jsx           ← PNG / Web Share / video WebM
└── templates/
    ├── dinosaur.svg             ← 7 zonas animadas
    ├── butterfly.svg            ← 6 zonas animadas
    ├── fish.svg                 ← 6 zonas animadas
    └── bird.svg                 ← 6 zonas animadas
```

---

## ESTRUCTURA SVG REQUERIDA POR LA APP

Cada template SVG debe seguir esta estructura exacta para que el pipeline funcione:

```svg
<svg viewBox="0 0 500 380" xmlns="http://www.w3.org/2000/svg">

  <rect width="500" height="380" fill="white"/>

  <g data-zone="cola"
     data-label="Cola"
     data-pivot-x="70"
     data-pivot-y="230"
     data-anim="swing"
     data-anim-amplitude="18"
     data-anim-speed="1.2"
     data-anim-offset="0">
    <ellipse cx="80" cy="240" rx="40" ry="20" fill="white" stroke="none"/>
  </g>

  <!-- ...más zonas con la misma estructura... -->

  <g id="contornos" fill="none" stroke="#1a1a1a" stroke-width="2.5"
     stroke-linejoin="round" stroke-linecap="round">
    <!-- Mismas geometrías pero solo stroke, sin fill -->
  </g>

</svg>
```

**Atributos obligatorios por zona:**
- `data-zone` — ID único (string, sin espacios)
- `data-label` — Nombre legible en español
- `data-pivot-x` / `data-pivot-y` — Punto de rotación en coords del viewBox
- `data-anim` — Tipo: `swing` | `breathe` | `float` | `walk` | `shimmer`
- `data-anim-amplitude` — Grados (swing/walk), fracción (breathe), px (float)
- `data-anim-speed` — Ciclos por segundo (0.3–3.0)
- `data-anim-offset` — Fase inicial en radianes (0–6.28)

**Tipos de animación:**
- `swing` → `rotation = init + sin(t·speed·2π + offset) · amplitude°`
- `breathe` → `scaleY = 1 + sin(t·speed·2π + offset) · amplitude`
- `float` → `y = init_y + sin(t·speed·2π + offset) · amplitude`
- `walk` → igual que swing pero con offset=π para alternar patas
- `shimmer` → `alpha = 0.6 + ((1 + sin(t·speed·2π + offset)) / 2) · 0.4`

---

## PIPELINE DE DATOS (v1.1)

```
MediaDevices API → video frames
    ↓
CameraCapture (RAF 60fps / detección 250ms throttle)
    ↓ OpenCV.js
    ├── GRAY → GaussianBlur(5×5) → Canny(75,200) → dilate(3×3,2iter)
    ├── findContours(RETR_EXTERNAL) → approxPolyDP(ε=2%perím)
    └── orderCorners → warpPerspective(INTER_LINEAR) → dataURL
                ↓
         ColorAnalyzer
    ├── correctWhitePaper(borderSize=30)    ← corrección de iluminación
    ├── extractZoneMasks(svgString, w, h)   ← SVG → N canvas binarios
    ├── extractZonePixels + filterColoredPixels
    ├── kMeansColors(pixels, k=3, iters=15)
    └── classifyColors(tf, dominantRgbs, palette) ← TF.js LAB ΔE batch
                ↓
         ZoneColorMap { zoneId → { rgb, hex, name, deltaE, confidence } }
                ↓
         buildPixiScene → renderZoneCanvas×N [paralelo] + renderContoursCanvas
                ↓
         setupAnimations + burstCelebration + startSparkles
```

---

## MEJORAS A IMPLEMENTAR — v2.0

Se deben implementar **tres nuevas funcionalidades** que transforman la app de templates fijos a una plataforma abierta. Las mejoras son **aditivas** — no rompen el pipeline existente.

---

### MEJORA 1 — Sistema de carga y configurador visual de templates

#### Contexto del problema
Las herramientas de diseño (Figma, Illustrator, Inkscape, Canva) exportan SVG perfectamente, pero sus SVG no contienen los atributos `data-zone`, `data-pivot-*`, `data-anim-*` que la app necesita. El objetivo es que cualquier persona pueda subir un SVG y configurar visualmente las zonas de animación sin tocar código.

#### Nuevas dependencias
```bash
npm install idb   # IndexedDB con API async/await (5KB)
```

#### Nuevos archivos a crear

**`src/hooks/useTemplateStorage.js`**
Hook que gestiona un store `templates` en IndexedDB usando `idb`.

```javascript
// Esquema de cada template guardado en IndexedDB
{
  id: string,              // UUID generado al guardar
  label: string,           // "Dragón"
  icon: string,            // "🐉"
  svg: string,             // SVG completo con data-* ya inyectados
  zones: number,           // cantidad de zonas configuradas
  isBuiltIn: boolean,      // false para templates del usuario
  createdAt: number,       // timestamp Unix
  referenceImages: Blob[], // fotos de referencia para auto-detección (Mejora 2)
}

// API pública del hook
const {
  templates,        // Array con [...builtIns, ...userTemplates]
  saveTemplate,     // async (templateData) → id
  deleteTemplate,   // async (id) → void
  isLoading,        // boolean
} = useTemplateStorage();
```

**`src/utils/svgValidator.js`**
Valida que el SVG subido por el usuario sea procesable.

```javascript
// Retorna { valid: boolean, warnings: string[], errors: string[], groupCount: number }
validateSVG(svgString)

// Reglas:
// ERROR   → no es XML válido
// ERROR   → no tiene elemento <svg> raíz
// ERROR   → no tiene atributo viewBox
// WARNING → no tiene grupos <g> diferenciados (funciona igual con paths)
// WARNING → tiene atributos propietarios de Illustrator (se limpian automáticamente)
// INFO    → N grupos <g> detectados
```

**`src/utils/svgZoneParser.js`**
Extrae los grupos identificables del SVG para presentarlos en el configurador.

```javascript
// Retorna Array<{ id, element, suggestedName, bbox, hasChildren }>
parseZoneCandidates(svgString)

// Lógica:
// 1. Parsea con DOMParser
// 2. Extrae todos los <g> de primer nivel que contengan geometría
// 3. Si el <g> tiene id (ej: "capa_cola" de Illustrator), sugiere ese nombre
// 4. Calcula bounding box de cada grupo para highlight en el configurador
// 5. También detecta <path> y <ellipse> de nivel raíz como zonas candidatas
```

**`src/utils/svgMetaInjector.js`**
Inyecta los atributos `data-*` en el SVG según la configuración del usuario.

```javascript
// svgString: SVG original del usuario
// zonesConfig: Map<elementId, { zoneId, label, pivotX, pivotY, anim, amplitude, speed, offset }>
// Retorna: SVG string con data-* correctamente inyectados y limpiado
injectZoneMetadata(svgString, zonesConfig)

// También:
// - Limpia atributos propietarios (xmlns:xlink, sodipodi:*, inkscape:*)
// - Añadir id="contornos" si el usuario marcó un grupo como capa de contornos
// - Normaliza viewBox si faltaba
```

**`src/components/TemplateUploadModal.jsx`**
Modal de dos pasos: (1) cargar archivos y (2) llamar al configurador.

```
Paso 1 — Subir archivos:
┌──────────────────────────────────────────────────────┐
│  Nueva plantilla                              [✕]    │
│                                                      │
│  Nombre del animal                                   │
│  [ Dragón                                        ]   │
│                                                      │
│  Ícono (emoji)   [ 🐉 ]                              │
│                                                      │
│  Archivo SVG                                         │
│  [ 📎 dragon.svg              ] [Cambiar]            │
│  ✅ SVG válido — 4 grupos detectados                 │
│                                                      │
│  Fotos de referencia (para detección automática)     │
│  Sube 3–5 fotos del dibujo coloreado                 │
│  [img1] [img2] [img3] [  +  ]                        │
│  (opcional)                                          │
│                                                      │
│  [Cancelar]          [Siguiente: Configurar →]       │
└──────────────────────────────────────────────────────┘
```

**`src/components/SVGZoneConfigurator.jsx`**
Editor visual de zonas — el componente más complejo de la v2.0.

Comportamiento requerido:
1. Renderiza el SVG del usuario en un panel izquierdo (tamaño completo, scrollable si es grande)
2. Detecta automáticamente grupos `<g>` y asigna colores de highlight temporales a cada uno para que el usuario los distinga
3. Al hacer **clic sobre el SVG**, detecta qué grupo está bajo el cursor usando `document.elementFromPoint()` o hit-testing SVG nativo, resalta ese grupo con borde punteado animado y activa el panel lateral
4. El panel lateral (`ZoneConfigPanel`) muestra los controles para esa zona
5. Modo especial **"Seleccionar pivot"**: al activarlo, el siguiente clic en el SVG establece las coordenadas `(pivot-x, pivot-y)` relativas al viewBox
6. Preview en vivo: muestra la animación de la zona seleccionada usando `requestAnimationFrame` sobre el SVG del preview
7. Lista de zonas configuradas en la parte inferior izquierda con checkmarks

```
Layout:
┌─────────────────────────────────────────────────────────────┐
│  Configura las zonas de tu plantilla    Dragón  [Guardar]   │
├───────────────────────────────┬─────────────────────────────┤
│                               │  Zona seleccionada          │
│      [SVG preview]            │                             │
│    (zona resaltada con        │  Nombre: [ cola         ]   │
│     borde punteado)           │                             │
│                               │  Animación: [swing ▼]       │
│  Zonas configuradas:          │                             │
│  ✅ cuerpo  ✅ cabeza         │  [📍 Fijar punto de pivote] │
│  ✅ cola    ⬜ ala            │  Actual: x=70, y=230         │
│  ⬜ patas                     │                             │
│                               │  Amplitud  ──●────  18°     │
│                               │  Velocidad ────●──  1.2 Hz  │
│                               │  Offset    ──●────  0 rad   │
│                               │                             │
│                               │  [▶ Ver animación]          │
└───────────────────────────────┴─────────────────────────────┘
```

**`src/components/ZoneConfigPanel.jsx`**
Panel lateral con los controles de configuración de una zona individual. Props: `{ zone, onUpdate }`.

Controles:
- Nombre de zona: `<input type="text">`
- Tipo de animación: `<select>` con opciones swing / breathe / float / walk / shimmer + descripción de cada uno
- Botón "Fijar punto de pivote" → activa modo de selección en el SVG padre
- Amplitud: `<input type="range">` con valor numérico visible
- Velocidad: `<input type="range">` 0.3–3.0 Hz
- Offset de fase: `<input type="range">` 0–6.28 rad
- Toggle "Ver animación en vivo" → activa preview de esa zona

#### Archivos a modificar

**`src/components/TemplateGallery.jsx`**
- Recibir `userTemplates` desde `useTemplateStorage`
- Fusionar con `TEMPLATES` prediseñados: `allTemplates = [...builtIns, ...userTemplates]`
- Añadir botón "➕ Agregar mi propia plantilla" al final de la galería
- Al hacer clic → abrir `TemplateUploadModal`
- Mostrar opción de eliminar en los templates del usuario (no en los prediseñados)

**`src/App.jsx`**
- Importar `useTemplateStorage`
- Reemplazar el objeto `TEMPLATES` estático por `allTemplates` del hook
- Pasar `onTemplateSaved` callback al modal para actualizar la galería tras guardar

---

### MEJORA 2 — Auto-detección de template con ML (KNN + MobileNet)

#### Contexto
Actualmente el usuario debe seleccionar manualmente qué template usó. Con esta mejora, la app detecta automáticamente qué animal está frente a la cámara basándose en las fotos de referencia que el usuario subió al crear el template.

#### Nuevas dependencias
```bash
npm install @tensorflow-models/mobilenet     # ~17MB de pesos (carga lazy)
npm install @tensorflow-models/knn-classifier # ~50KB
```

#### Arquitectura ML

MobileNet actúa como **extractor de características** (no clasificador): dado el frame de la cámara, genera un tensor de 1024 dimensiones que representa las características visuales de la imagen. El KNN Classifier aprende a asociar esos vectores con cada template.

**¿Por qué KNN y no una red neuronal?**
- KNN es incremental: añadir un nuevo template = añadir ejemplos, no reentrenar
- Funciona con muy pocos ejemplos (3–5 fotos por clase)
- Determinístico y sin hiperparámetros complicados
- Serializable a JSON → persiste en IndexedDB entre sesiones

#### Nuevo archivo: `src/hooks/useTemplateClassifier.js`

```javascript
// API pública del hook
const {
  isReady,         // true cuando MobileNet + KNN están cargados y listos
  isLoading,       // true durante la carga inicial
  addExamples,     // async (templateId, imageBlobs[]) → void
  predict,         // async (imageElement | canvas | tensor) → { templateId, confidence, allConfidences }
  removeTemplate,  // async (templateId) → void (elimina sus ejemplos del KNN)
  exampleCount,    // Map<templateId, número de ejemplos cargados>
} = useTemplateClassifier();

// Carga MobileNet con intermediate layer (embeddings de 1024 dims)
// Restaura el estado KNN desde IndexedDB al montar
// Serializa el estado KNN a IndexedDB cada vez que se añaden ejemplos
```

**Implementación interna clave:**

```javascript
import * as mobilenetLib from '@tensorflow-models/mobilenet';
import * as knnClassifier from '@tensorflow-models/knn-classifier';
import * as tf from '@tensorflow/tfjs';

// Cargar como extractor de características (NO clasificador final)
const mobilenet = await mobilenetLib.load({ version: 2, alpha: 1.0 });
const knn = knnClassifier.create();

// Extraer embedding de una imagen
function getEmbedding(imageElement) {
  return mobilenet.infer(imageElement, true); // true = intermediate layer
}

// Añadir ejemplos de entrenamiento
async function addExamples(templateId, imageBlobs) {
  for (const blob of imageBlobs) {
    const img = await blobToImageElement(blob);
    const embedding = getEmbedding(img);
    knn.addExample(embedding, templateId);
    embedding.dispose();
  }
  await persistKNNState();
}

// Clasificar un frame
async function predict(imageElement) {
  if (knn.getNumClasses() < 2) return null;
  const embedding = getEmbedding(imageElement);
  const result = await knn.predictClass(embedding);
  embedding.dispose();
  return {
    templateId: result.label,
    confidence: result.confidences[result.label],
    allConfidences: result.confidences,
  };
}

// Serializar KNN para IndexedDB
async function persistKNNState() {
  const dataset = knn.getClassifierDataset();
  const serialized = {};
  for (const [key, tensor] of Object.entries(dataset)) {
    serialized[key] = {
      data: Array.from(tensor.dataSync()),
      shape: tensor.shape,
    };
  }
  await db.put('knn-classifier', 'state', serialized);
}

// Restaurar KNN desde IndexedDB
async function restoreKNNState() {
  const serialized = await db.get('knn-classifier', 'state');
  if (!serialized) return;
  const dataset = {};
  for (const [key, { data, shape }] of Object.entries(serialized)) {
    dataset[key] = tf.tensor2d(data, shape);
  }
  knn.setClassifierDataset(dataset);
}
```

#### Modificar: `src/components/CameraCapture.jsx`

Añadir inferencia de template en el loop de detección:

```
Loop de CameraCapture actualizado:

[cada 250ms — throttle existente]
  ├── [EXISTENTE] Detección de papel con OpenCV
  │
  └── [NUEVO] Si papel detectado con confianza > 0.6 Y clasificador listo:
      ├── Correr predict(currentFrame) con el KNN
      ├── Si confidence ≥ 0.75:
      │   └── Mostrar badge: "🧠 Detectado: 🐉 Dragón (92%)"
      │       con botones [✓ Sí] [✗ No es este]
      └── Si confidence < 0.75 o hay empate:
          └── Mostrar chips de los 2 candidatos más probables para confirmar

Badge de detección automática:
┌────────────────────────────────────────────┐
│  🧠 Detectado: 🐉 Dragón  (92%)  [✓] [✗]  │
└────────────────────────────────────────────┘
```

**Umbral de confianza:** 0.75 (configurable como constante `MIN_CONFIDENCE`). Por debajo de este umbral, mostrar los 2 mejores candidatos para que el usuario confirme.

**Carga lazy de MobileNet:** Solo iniciar la carga de MobileNet si hay al menos 2 templates con fotos de referencia guardadas en IndexedDB. Si no hay suficientes templates, el clasificador no se activa y el flujo es idéntico a v1.1.

---

### MEJORA 3 — Detección de papel con ML (entrenamiento offline)

#### Contexto
El pipeline actual (OpenCV: Canny + approxPolyDP) falla cuando:
- El papel está sobre una superficie de color similar (mesa blanca o beige)
- La iluminación crea sombras fuertes que rompen los bordes

La solución es un modelo ML entrenado offline que actúa como **fallback** cuando OpenCV tiene baja confianza.

#### Estructura de carpetas de entrenamiento

Crear fuera de `src/`, en la raíz del proyecto:

```
training/
└── paper-detector/
    ├── README.md
    ├── data/
    │   ├── positive/     ← mínimo 60 fotos CON hoja de papel visible
    │   └── negative/     ← mínimo 60 fotos SIN hoja (fondos variados)
    ├── scripts/
    │   ├── train.js      ← entrenamiento con TF.js Node
    │   ├── evaluate.js   ← métricas de precisión
    │   └── convert.js    ← exportar a formato TFJS
    └── model/            ← modelo final (se incluye en public/ del bundle)
        ├── model.json
        └── group1-shard1of1.bin
```

#### Instrucciones para las fotos (`training/paper-detector/README.md`)

**`data/positive/` — fotos CON hoja de papel:**
- Hoja blanca sobre mesa de madera, vidrio, tela, alfombra, mármol
- Con y sin iluminación natural / artificial / mixta
- Ángulos: frontal, 15°, 30° de inclinación de la cámara
- Con hoja en blanco Y con dibujo coloreado encima
- Distancias: 30cm – 80cm de la cámara
- Con y sin sombras parciales sobre la hoja

**`data/negative/` — fotos SIN hoja:**
- Mesa o superficie vacía
- Manos, libros, cuadernos, objetos de escritorio
- Fondo de sala, cama, patio
- Pantalla de computadora o tablet (falsos positivos comunes)
- Papel arrugado o doblado (para que el modelo sea robusto)

#### Script `training/paper-detector/scripts/train.js`

Entrenamiento con TF.js Node usando transfer learning sobre MobileNet:

```javascript
import * as tf from '@tensorflow/tfjs-node'; // usa npm install @tensorflow/tfjs-node
import * as mobilenet from '@tensorflow-models/mobilenet';

// 1. Cargar MobileNet base (frozen)
const baseModel = await mobilenet.load({ version: 2, alpha: 1.0 });
const truncated = tf.model({
  inputs: baseModel.model.inputs,
  outputs: baseModel.model.getLayer('conv_pw_13_relu').output,
});
truncated.trainable = false; // congelar pesos de MobileNet

// 2. Añadir capas de clasificación binaria
const model = tf.sequential({
  layers: [
    truncated,
    tf.layers.globalAveragePooling2d(),
    tf.layers.dense({ units: 128, activation: 'relu' }),
    tf.layers.dropout({ rate: 0.3 }),
    tf.layers.dense({ units: 1, activation: 'sigmoid' }), // 1=papel, 0=no-papel
  ],
});

model.compile({
  optimizer: tf.train.adam(0.001),
  loss: 'binaryCrossentropy',
  metrics: ['accuracy'],
});

// 3. Cargar y normalizar imágenes desde disco
// (implementar loadImagesFromFolder con tf.node.decodeImage)

// 4. Entrenar (~5-10 min en CPU, ~1 min en GPU)
await model.fit(trainDataset, {
  epochs: 20,
  validationSplit: 0.2,
  callbacks: tf.callbacks.earlyStopping({ monitor: 'val_loss', patience: 3 }),
});

// 5. Exportar en formato TFJS para uso en el navegador
await model.save('file://./model');
```

#### Modificar: `src/utils/paperDetector.js`

Estrategia en cascada: OpenCV primero, ML como fallback.

```javascript
// paperDetector.js — firma actualizada
export async function detectPaper(frame, cv, mlModel = null) {

  // PASO 1: Pipeline OpenCV (rápido, ~50ms)
  const opencvResult = runOpenCVPipeline(frame, cv);

  // Si OpenCV tiene alta confianza, usar directamente
  if (opencvResult.confidence > 0.80) {
    return opencvResult;
  }

  // PASO 2: Fallback ML si está cargado y OpenCV falló
  if (mlModel !== null && opencvResult.confidence < 0.50) {
    const hasPaper = await runMLDetection(frame, mlModel);
    if (hasPaper) {
      // El modelo confirma que hay papel pero no da esquinas exactas
      // → Intentar OpenCV con parámetros más permisivos
      return runOpenCVPipeline(frame, cv, { relaxed: true });
    }
  }

  // Si ambos fallan o ML no está disponible: devolver el mejor resultado de OpenCV
  return opencvResult;
}

// Carga del modelo ML (lazy, desde public/paper-detector-model/)
export async function loadPaperDetectorModel() {
  try {
    const tf = await import('@tensorflow/tfjs');
    const model = await tf.loadLayersModel('/paper-detector-model/model.json');
    return model;
  } catch {
    console.warn('[paperDetector] Modelo ML no disponible, usando solo OpenCV');
    return null;
  }
}
```

---

## REGLAS GENERALES PARA TODA LA IMPLEMENTACIÓN

### Compatibilidad y robustez
- Todo acceso a `localStorage` e `IndexedDB` debe estar en bloques `try/catch` — pueden fallar en modo privado de Safari
- MobileNet y el modelo ML se cargan con **dynamic import()** — nunca en el bundle principal
- En iOS Safari: TF.js debe usar backend CPU. Detectar con `/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))`
- Todos los botones nuevos deben tener `min-height: 48px` y `touch-action: manipulation`

### Gestión de memoria
- Todos los tensors de TF.js creados para embeddings deben ser liberados con `.dispose()` inmediatamente después de usarlos
- Los `cv.Mat` de OpenCV deben estar en bloques `try/finally { mat.delete() }`

### Rendimiento
- La inferencia KNN no debe correr en cada frame del RAF loop — throttle a 500ms mínimo
- Las imágenes de referencia deben redimensionarse a 224×224px antes de pasarlas a MobileNet (es el tamaño de entrada que espera)
- El modelo ML de detección de papel solo se carga si el archivo `model.json` existe en `public/`

### UX y diseño
- El configurador de zonas debe funcionar en móvil — todos los controles deben ser táctiles
- Si la detección automática de template falla (confianza baja), siempre hay fallback a selección manual sin mensaje de error
- El botón "Guardar template" en el configurador solo se activa si hay al menos 1 zona configurada

### Retrocompatibilidad
- Los 4 templates prediseñados (dinosaur, butterfly, fish, bird) no se tocan
- El pipeline completo de Fases 1–4 (captura → colores → animación) funciona sin ningún cambio para los templates prediseñados
- `App.jsx` fusiona `TEMPLATES` estático con `userTemplates` de IndexedDB; si IndexedDB está vacío, la app funciona exactamente igual que v1.1

---

## ORDEN DE IMPLEMENTACIÓN

```
Sprint 1 (base, sin ML):
  useTemplateStorage.js → svgValidator.js → svgZoneParser.js
  → TemplateUploadModal.jsx (solo paso 1) → TemplateGallery.jsx actualizado

Sprint 2 (configurador visual):
  svgMetaInjector.js → ZoneConfigPanel.jsx → SVGZoneConfigurator.jsx
  → TemplateUploadModal.jsx completo → App.jsx actualizado

Sprint 3 (ML de templates):
  useTemplateClassifier.js → TemplateUploadModal.jsx (fotos de referencia)
  → CameraCapture.jsx actualizado (badge de detección)

Sprint 4 (ML de papel — paralelo):
  Crear training/ → scripts/train.js → integrar en paperDetector.js
```

---

*Proyecto: Libro de Colorear que Cobra Vida*
*Stack base: React 18 + Vite 5 + OpenCV.js + TF.js + PixiJS 7*
*Nuevas dependencias v2.0: idb + @tensorflow-models/mobilenet + @tensorflow-models/knn-classifier*
*Target: Android Chrome + iOS Safari | Sin backend | 100% navegador*
