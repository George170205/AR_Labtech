# Plan de Mejoras — Libro de Colorear que Cobra Vida
### Versión 2.0 — Documento de arquitectura e implementación

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Nuevas dependencias](#2-nuevas-dependencias)
3. [Nueva estructura de carpetas](#3-nueva-estructura-de-carpetas)
4. [Fase 1 — Sistema de carga y configurador de templates](#4-fase-1--sistema-de-carga-y-configurador-de-templates)
5. [Fase 2 — Auto-detección de template con ML](#5-fase-2--auto-detección-de-template-con-ml)
6. [Fase 3 — Detección de papel con ML](#6-fase-3--detección-de-papel-con-ml)
7. [Diseño UX — Pantallas nuevas](#7-diseño-ux--pantallas-nuevas)
8. [Flujo de datos actualizado](#8-flujo-de-datos-actualizado)
9. [Estrategia de migración desde v1.1](#9-estrategia-de-migración-desde-v11)
10. [Orden de implementación recomendado](#10-orden-de-implementación-recomendado)
11. [Riesgos y mitigaciones](#11-riesgos-y-mitigaciones)

---

## 1. Resumen ejecutivo

La v2.0 introduce tres capacidades nuevas que transforman la app de un producto con templates fijos a una **plataforma abierta** donde cualquier persona puede:

- Diseñar un animal en Figma / Illustrator / Inkscape, exportarlo como SVG y subirlo a la app
- Configurar visualmente las zonas de animación sin tocar código
- Que la app detecte automáticamente qué template está frente a la cámara, sin que el niño o el adulto tenga que seleccionarlo

Las tres fases son **aditivas** — no rompen el pipeline actual. La v1.1 sigue funcionando tal cual para los 4 templates existentes.

---

## 2. Nuevas dependencias

### 2.1 Dependencias npm a instalar

```bash
# ML — auto-detección de templates
npm install @tensorflow-models/mobilenet
npm install @tensorflow-models/knn-classifier

# IndexedDB — almacenamiento de templates y del modelo KNN
npm install idb

# Procesamiento SVG en el configurador
# (ninguna — se usa DOMParser nativo del navegador)
```

### 2.2 Tabla de dependencias completa (v2.0)

| Paquete | Versión sugerida | Uso | Peso aprox. |
|---|---|---|---|
| `react` | ^18.3.1 | Framework UI | ya instalado |
| `react-dom` | ^18.3.1 | Renderer | ya instalado |
| `@tensorflow/tfjs` | ^4.22.0 | Base TF.js | ya instalado |
| `pixi.js` | ^7.4.2 | Animación | ya instalado |
| `@tensorflow-models/mobilenet` | ^2.1.1 | Extractor de características | ~17 MB (pesos) |
| `@tensorflow-models/knn-classifier` | ^1.2.4 | Clasificador incremental | ~50 KB |
| `idb` | ^8.0.0 | IndexedDB tipado y sencillo | ~5 KB |

> **¿Por qué `idb` y no IndexedDB nativo?** La API nativa de IndexedDB es verbosa y basada en eventos. `idb` envuelve todo con Promises/async-await sin añadir abstracción innecesaria. Peso mínimo (5 KB).

> **¿Por qué MobileNet v2?** Ya tenemos TF.js instalado. MobileNet actúa como extractor de características (embedding de 1024 dimensiones por imagen). El KNN Classifier aprende sobre esos embeddings. No necesitamos entrenar nada — MobileNet viene pre-entrenado con ImageNet. Solo necesitamos sus capas intermedias como "ojos" para reconocer formas.

---

## 3. Nueva estructura de carpetas

```
src/
│
├── main.jsx
├── App.jsx                         ← Actualizado: nuevo paso de configuración
├── App.css
│
├── hooks/
│   ├── useCamera.js                ← Sin cambios
│   ├── useOpenCV.js                ← Sin cambios
│   ├── useTensorFlow.js            ← Sin cambios
│   ├── useSoundFeedback.js         ← Sin cambios
│   ├── useWebShare.js              ← Sin cambios
│   ├── useTemplateStorage.js       ← NUEVO: IndexedDB para templates
│   └── useTemplateClassifier.js    ← NUEVO: MobileNet + KNN
│
├── utils/
│   ├── paperDetector.js            ← Actualizado: fallback ML (Fase 3)
│   ├── perspectiveCorrector.js     ← Sin cambios
│   ├── colorUtils.js               ← Sin cambios
│   ├── illuminationCorrector.js    ← Sin cambios
│   ├── zoneExtractor.js            ← Sin cambios
│   ├── kMeansColor.js              ← Sin cambios
│   ├── colorClassifier.js          ← Sin cambios
│   ├── colorAnalyzer.js            ← Sin cambios
│   ├── sceneBuilder.js             ← Sin cambios
│   ├── animators.js                ← Sin cambios
│   ├── particleEffects.js          ← Sin cambios
│   ├── svgValidator.js             ← NUEVO: valida SVG subido por usuario
│   ├── svgZoneParser.js            ← NUEVO: extrae grupos/capas del SVG
│   └── svgMetaInjector.js          ← NUEVO: inyecta data-* en el SVG final
│
├── components/
│   ├── CameraCapture.jsx           ← Actualizado: inferencia de template
│   ├── CameraCapture.css
│   ├── ColorAnalyzer.jsx           ← Sin cambios
│   ├── ColorAnalyzer.css
│   ├── ZoneColorCard.jsx           ← Sin cambios
│   ├── AnimationScene.jsx          ← Sin cambios
│   ├── AnimationScene.css
│   ├── TemplateGallery.jsx         ← Actualizado: botón "+", templates de IndexedDB
│   ├── TemplateGallery.css
│   ├── OnboardingOverlay.jsx       ← Sin cambios
│   ├── OnboardingOverlay.css
│   ├── ShareModal.jsx              ← Sin cambios
│   ├── ShareModal.css
│   │
│   │   ── NUEVOS: Fase 1 ──
│   ├── TemplateUploadModal.jsx     ← NUEVO: modal de carga + imágenes de referencia
│   ├── TemplateUploadModal.css
│   ├── SVGZoneConfigurator.jsx     ← NUEVO: editor visual de zonas (el más complejo)
│   ├── SVGZoneConfigurator.css
│   ├── ZoneConfigPanel.jsx         ← NUEVO: panel lateral por zona seleccionada
│   └── ZoneConfigPanel.css
│
├── templates/                      ← Templates prediseñados (sin cambios)
│   ├── dinosaur.svg
│   ├── butterfly.svg
│   ├── fish.svg
│   └── bird.svg
│
└── training/                       ← NUEVA carpeta (Fase 3, fuera de src/)
    └── paper-detector/
        ├── README.md
        ├── positive/               ← Fotos de hoja sobre mesa (tú las subes)
        ├── negative/               ← Fotos de mesa sin hoja (tú las subes)
        ├── train.js                ← Script de entrenamiento (Node.js)
        └── model/                  ← Modelo exportado listo para la app
            ├── model.json
            └── weights.bin
```

---

## 4. Fase 1 — Sistema de carga y configurador de templates

### 4.1 Visión general del flujo

```
Usuario en TemplateGallery
    │
    └── Clic en botón "+"
            │
            ▼
    TemplateUploadModal
    ├── Campo: nombre del animal ("Dragón")
    ├── Campo: emoji/ícono ("🐉")
    ├── Input: subir SVG (file picker)
    └── Input: subir 3–5 fotos de referencia (para Fase 2)
            │
            ▼ svgValidator.js
    Validación del SVG
    ├── ¿Es SVG válido?
    ├── ¿Tiene viewBox?
    ├── ¿Tiene grupos (<g>) identificables?
    └── Advertencias si faltan data-zone (se pueden configurar a continuación)
            │
            ▼
    SVGZoneConfigurator  ← La pantalla más importante
    ├── Preview del SVG en pantalla completa
    ├── Detección automática de grupos (<g>) y paths independientes
    ├── El usuario hace clic sobre cada zona → se resalta
    ├── Panel lateral: nombre, tipo de animación, pivot, amplitud, velocidad
    └── Botón "Guardar template"
            │
            ▼ svgMetaInjector.js
    SVG con data-* inyectados
            │
            ▼ useTemplateStorage.js (IndexedDB)
    Template guardado
            │
            ▼
    Vuelve a TemplateGallery (el nuevo template aparece al final)
```

### 4.2 `useTemplateStorage.js` — Hook de IndexedDB

Gestiona un store `templates` en IndexedDB con la siguiente estructura:

```javascript
// Esquema de cada template guardado
{
  id: string,              // UUID generado al guardar
  label: string,           // "Dragón"
  icon: string,            // "🐉"
  svg: string,             // SVG completo con data-* inyectados
  zones: number,           // cantidad de zonas configuradas
  isBuiltIn: boolean,      // false para templates del usuario
  createdAt: number,       // timestamp
  referenceImages: Blob[], // fotos de referencia para Fase 2 (3–5 imágenes)
}

// API del hook
const {
  templates,           // [...builtIns, ...userTemplates]
  saveTemplate,        // (templateData) → Promise<id>
  deleteTemplate,      // (id) → Promise<void>
  isLoading,
} = useTemplateStorage();
```

### 4.3 `svgValidator.js` — Validador de SVG

```javascript
// Retorna { valid: boolean, warnings: string[], errors: string[] }
validateSVG(svgString)

// Verificaciones:
// ERROR:   No es XML válido
// ERROR:   No tiene <svg> como elemento raíz
// ERROR:   No tiene atributo viewBox
// WARNING: No tiene grupos <g> diferenciados (el configurador igual funciona con paths)
// WARNING: Tiene datos de Illustrator (xmlns:xlink) que se pueden limpiar
// INFO:    N grupos <g> detectados → el configurador los mostrará automáticamente
```

### 4.4 `SVGZoneConfigurator.jsx` — El editor visual

Este es el componente más complejo. Funciona así:

**Detección automática de grupos:**
- Parsea el SVG con `DOMParser`
- Extrae todos los `<g>` de primer nivel que tengan hijos con geometría
- Asigna un color de highlight temporal a cada grupo para que el usuario los distinga
- Si el SVG tiene capas nombradas desde Illustrator/Figma (`id="capa_cola"`), usa esos nombres como sugerencia

**Interacción del usuario:**
- Clic sobre el SVG → detecta qué grupo está bajo el cursor (hit-testing sobre el elemento SVG)
- El grupo seleccionado se resalta con un borde punteado animado
- El panel lateral (ZoneConfigPanel) se activa con los controles de esa zona

**ZoneConfigPanel — controles por zona:**

| Control | Tipo | Descripción |
|---|---|---|
| Nombre de zona | `<input>` | "cola", "cuerpo", "cabeza", etc. |
| Tipo de animación | `<select>` | swing / breathe / float / walk / shimmer |
| Punto de pivote | Click en SVG | Modo "seleccionar pivot": el siguiente clic en el SVG establece (pivot-x, pivot-y) |
| Amplitud | `<input range>` | Grados (swing/walk) o escala (breathe) o px (float) |
| Velocidad | `<input range>` | 0.3 – 3.0 ciclos/segundo |
| Offset de fase | `<input range>` | 0 – 2π radianes |
| Preview en vivo | toggle | Activa la animación de esa zona en el preview para verificar |

### 4.5 `svgMetaInjector.js` — Inyector de metadatos

```javascript
// Toma el SVG original + el mapa de configuraciones del usuario
// Devuelve el SVG con todos los data-* correctamente inyectados
injectZoneMetadata(svgString, zonesConfig)

// zonesConfig: Map<elementId, { zoneId, label, pivotX, pivotY, anim, amplitude, speed, offset }>
```

Este util también se encarga de:
- Limpiar atributos propietarios de Illustrator (`xmlns:xlink`, `xml:space`, `sodipodi:*`)
- Agregar `id="contornos"` si el usuario marca un grupo como "capa de contornos"
- Normalizar el `viewBox` si estaba ausente

---

## 5. Fase 2 — Auto-detección de template con ML

### 5.1 Visión general

```
Al inicio de la app
    │
    └── useTemplateClassifier.js
        ├── Carga MobileNet (feature extractor)
        ├── Carga estado KNN guardado en IndexedDB
        └── Reconstruye el clasificador con los ejemplos guardados

Al capturar con la cámara (CameraCapture.jsx)
    │
    ├── [Si hay ≥2 templates con imágenes de referencia]
    │   └── Inferencia KNN sobre el frame actual
    │       ├── Confianza ≥ 0.75 → selecciona template automáticamente ✅
    │       └── Confianza < 0.75 → muestra selector manual con sugerencia
    │
    └── [Si hay <2 templates con referencias]
        └── Selector manual (comportamiento v1.1)

Al guardar un nuevo template (Fase 1)
    │
    └── Las fotos de referencia se pasan a useTemplateClassifier
        └── addExamples(templateId, referenceImages)
            ├── Extrae embeddings con MobileNet para cada foto
            ├── Los añade al KNN Classifier
            └── Serializa el estado KNN → IndexedDB
```

### 5.2 `useTemplateClassifier.js` — Hook del clasificador

```javascript
const {
  isReady,           // true cuando MobileNet + KNN están cargados
  addExamples,       // (templateId, imageBlobs[]) → entrena con nuevas fotos
  predict,           // (imageElement) → { templateId, confidence }
  removeTemplate,    // (templateId) → elimina sus ejemplos del KNN
  exampleCount,      // Map<templateId, número de ejemplos>
} = useTemplateClassifier();
```

**Detalles de implementación:**

```javascript
// Cargar MobileNet como extractor (intermediate layer)
const mobilenet = await mobilenetLib.load({
  version: 2,
  alpha: 1.0,
});

// Extraer embedding de una imagen (vector de 1024 dims)
const embedding = mobilenet.infer(imageElement, true); // true = intermediate layer

// Añadir ejemplos al KNN
knnClassifier.addExample(embedding, templateId);

// Clasificar
const result = await knnClassifier.predictClass(embedding);
// result.label = templateId ganador
// result.confidences = { templateId: 0.0–1.0, ... }
```

**Persistencia del clasificador en IndexedDB:**
El KNN Classifier de TF.js permite exportar/importar su estado como un objeto de tensors serializables. Se guarda en IndexedDB al agregar nuevos ejemplos y se restaura al iniciar la app.

```javascript
// Serializar (al añadir ejemplos)
const dataset = knnClassifier.getClassifierDataset();
const serialized = Object.fromEntries(
  Object.entries(dataset).map(([key, val]) => [key, Array.from(val.dataSync())])
);
await db.put('knn-model', serialized);

// Deserializar (al arrancar la app)
const serialized = await db.get('knn-model');
const dataset = Object.fromEntries(
  Object.entries(serialized).map(([key, arr]) => [key, tf.tensor2d(arr)])
);
knnClassifier.setClassifierDataset(dataset);
```

### 5.3 Integración en `CameraCapture.jsx`

```
Flujo actualizado de CameraCapture:

1. [Existente] RAF loop → detección de papel (OpenCV)
2. [NUEVO] Al detectar papel con suficiente confianza:
   a. Correr inferencia KNN sobre el frame actual
   b. Si confianza ≥ 0.75: auto-seleccionar template, mostrar badge "Detectado: 🦕 Dinosaurio"
   c. Si confianza < 0.75: mostrar chips de los 2 candidatos más probables para confirmar
3. [Existente] Botón de captura → pasa a ColorAnalyzer con el template seleccionado
```

### 5.4 Requisitos para el usuario al subir un template

- **Mínimo:** 3 fotos de referencia (el clasificador KNN funciona con pocos ejemplos)
- **Recomendado:** 5–8 fotos con variaciones de ángulo, iluminación y estilo de coloreado
- **Formato:** JPG o PNG, tomadas con el mismo tipo de dispositivo que se usará en la app
- Las fotos NO necesitan ser del dibujo completamente coloreado — incluso el contorno sin colorear funciona

---

## 6. Fase 3 — Detección de papel con ML

### 6.1 Contexto y estrategia

El pipeline actual (OpenCV: Canny + approxPolyDP) falla en dos escenarios:
1. **Fondo claro** — bajo contraste entre el papel blanco y una mesa blanca o beige
2. **Iluminación extrema** — sombras fuertes que rompen los bordes detectados

La estrategia de la Fase 3 es entrenamiento offline (no en el navegador) con transfer learning sobre MobileNet, exportando el modelo en formato TF.js para cargarlo en la app como **fallback** cuando OpenCV falla.

### 6.2 Estructura de carpetas de entrenamiento

```
training/
└── paper-detector/
    ├── README.md               ← Instrucciones para tomar las fotos
    │
    ├── data/
    │   ├── positive/           ← Fotos con hoja de papel visible sobre cualquier superficie
    │   │   ├── img_001.jpg     (mínimo 60 fotos recomendadas)
    │   │   ├── img_002.jpg
    │   │   └── ...
    │   │
    │   └── negative/           ← Fotos sin hoja de papel (solo mesa, manos, fondo)
    │       ├── img_001.jpg     (mínimo 60 fotos recomendadas)
    │       └── ...
    │
    ├── scripts/
    │   ├── train.js            ← Script de entrenamiento (Node.js + TF.js Node)
    │   ├── evaluate.js         ← Evalúa precisión sobre un conjunto de prueba
    │   └── convert.js          ← Convierte el modelo guardado a formato TFJS
    │
    └── model/                  ← Modelo final exportado (se incluye en el bundle)
        ├── model.json
        └── group1-shard1of1.bin
```

### 6.3 Instrucciones para las fotos de entrenamiento

**Carpeta `positive/` — fotos CON hoja:**
- Hoja en blanco sobre mesa de madera, vidrio, tela, alfombra
- Con y sin buena iluminación (luz natural, artificial, mixta)
- Diferentes ángulos (frontal, 15°, 30° de inclinación)
- Con y sin el dibujo ya coloreado encima
- Desde diferentes distancias (30cm – 80cm)

**Carpeta `negative/` — fotos SIN hoja:**
- Mesa vacía
- Manos, libros, cuadernos (cosas que NO deben activar la detección)
- Fondo de sala, patio, cama
- Pantalla de computadora o tablet (falsos positivos comunes)

### 6.4 `scripts/train.js` — Script de entrenamiento

```javascript
// Pseudocódigo del script de entrenamiento
import * as tf from '@tensorflow/tfjs-node';
import * as mobilenet from '@tensorflow-models/mobilenet';
import { loadImagesFromFolder } from './utils.js';

// 1. Cargar MobileNet pre-entrenado
const baseModel = await mobilenet.load({ version: 2, alpha: 1.0 });

// 2. Extraer capa intermedia (embedding layer)
const truncated = tf.model({
  inputs: baseModel.model.inputs,
  outputs: baseModel.model.getLayer('conv_pw_13_relu').output
});

// 3. Añadir capas de clasificación binaria
const model = tf.sequential({
  layers: [
    truncated,
    tf.layers.globalAveragePooling2d(),
    tf.layers.dense({ units: 128, activation: 'relu' }),
    tf.layers.dropout({ rate: 0.3 }),
    tf.layers.dense({ units: 1, activation: 'sigmoid' })
  ]
});

// 4. Congelar pesos de MobileNet, solo entrenar las capas nuevas
truncated.trainable = false;

model.compile({
  optimizer: tf.train.adam(0.001),
  loss: 'binaryCrossentropy',
  metrics: ['accuracy']
});

// 5. Cargar y preparar imágenes
const positives = await loadImagesFromFolder('./data/positive');
const negatives = await loadImagesFromFolder('./data/negative');

// 6. Entrenar (~5–10 minutos en CPU, ~1 min en GPU)
await model.fit(dataset, {
  epochs: 20,
  validationSplit: 0.2,
  callbacks: tf.callbacks.earlyStopping({ patience: 3 })
});

// 7. Exportar en formato TFJS
await model.save('file://./model');
```

### 6.5 Integración en `paperDetector.js`

```javascript
// paperDetector.js actualizado — estrategia en cascada:

export async function detectPaper(frame, cv, mlModel = null) {

  // Intento 1: Pipeline OpenCV (rápido, preciso cuando hay contraste)
  const opencvResult = runOpenCVPipeline(frame, cv);
  if (opencvResult.confidence > 0.8) return opencvResult;

  // Intento 2: Modelo ML como fallback (si está cargado y OpenCV falló)
  if (mlModel && opencvResult.confidence < 0.5) {
    const mlResult = await runMLDetection(frame, mlModel);
    if (mlResult.detected) {
      // El modelo ML detecta SI hay papel, pero no da las esquinas exactas
      // → Usar resultado de OpenCV con esquinas estimadas + refinamiento
      return refineCorners(opencvResult, mlResult);
    }
  }

  // Si ambos fallan: devolver el mejor resultado de OpenCV con baja confianza
  return opencvResult;
}
```

---

## 7. Diseño UX — Pantallas nuevas

### 7.1 Botón "+" en TemplateGallery

```
┌────────────────────────────────────────────────┐
│  Elige tu plantilla                            │
│                                                │
│  [🦕 Dinosaurio] [🦋 Mariposa] [🐟 Pez] [🐦 Pájaro]  │
│                                                │
│  [🐉 Dragón]  [🚀 Cohete]                      │ ← templates del usuario
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │  ➕  Agregar mi propia plantilla          │  │ ← botón nuevo
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

### 7.2 `TemplateUploadModal` — Paso 1: Cargar archivos

```
┌──────────────────────────────────────────────────────┐
│  Nueva plantilla                              [✕]    │
│                                                      │
│  Nombre del animal                                   │
│  ┌────────────────────────────────────────────────┐  │
│  │  Dragón                                        │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Ícono (emoji)   [🐉]                                │
│                                                      │
│  Archivo SVG                                         │
│  ┌──────────────────────────────────┐                │
│  │  📎  dragon.svg                  │  [Cambiar]     │
│  └──────────────────────────────────┘                │
│  ✅ SVG válido — 4 grupos detectados                 │
│                                                      │
│  Fotos de referencia (para detección automática)     │
│  Sube 3–5 fotos del dibujo coloreado                 │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                │
│  │ img1 │ │ img2 │ │ img3 │ │  +   │                │
│  └──────┘ └──────┘ └──────┘ └──────┘                │
│  (opcional — sin fotos no habrá detección automática)│
│                                                      │
│  [Cancelar]              [Siguiente: Configurar →]   │
└──────────────────────────────────────────────────────┘
```

### 7.3 `SVGZoneConfigurator` — Paso 2: Configurar zonas

```
┌─────────────────────────────────────────────────────────────────────┐
│  Configura las zonas de tu plantilla               Dragón  [Guardar] │
├─────────────────────────────────┬───────────────────────────────────┤
│                                 │  Zona seleccionada: Grupo 2        │
│         [SVG del dragón]        │                                    │
│                                 │  Nombre de la zona                 │
│    ╔══════════════╗             │  ┌───────────────────────────┐     │
│    ║ zona         ║             │  │  cola                     │     │
│    ║ seleccionada ║             │  └───────────────────────────┘     │
│    ║ (resaltada)  ║             │                                    │
│    ╚══════════════╝             │  Tipo de animación                 │
│                                 │  ┌───────────────────────────┐     │
│  Zonas configuradas:            │  │  🔄 swing (balanceo)  ▼   │     │
│  ✅ cuerpo   ✅ cabeza          │  └───────────────────────────┘     │
│  ✅ cola     ⬜ ala             │                                    │
│  ⬜ patas    ⬜ fuego           │  Punto de pivote                   │
│                                 │  [📍 Clic en el SVG para fijar]    │
│                                 │  Actual: x=70, y=230               │
│                                 │                                    │
│                                 │  Amplitud ──●──────── 18°          │
│                                 │  Velocidad ────●────── 1.2 Hz      │
│                                 │  Offset ──●──────────  0 rad       │
│                                 │                                    │
│                                 │  [▶ Ver animación de esta zona]    │
└─────────────────────────────────┴───────────────────────────────────┘
```

### 7.4 Badge de auto-detección en CameraCapture

```
┌──────────────────────────────────────────────────┐
│                                                  │
│         [Visor de la cámara en vivo]             │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  🧠 Detectado: 🐉 Dragón  (92%)  [✓] [✗]  │  │  ← badge nuevo
│  └────────────────────────────────────────────┘  │
│                                                  │
│              [📷 Capturar]                       │
└──────────────────────────────────────────────────┘
```

---

## 8. Flujo de datos actualizado

```
App.jsx (estado global)
│
│  NUEVO estado añadido:
│  allTemplates = [...builtIns, ...userTemplates]  ← de useTemplateStorage
│  detectedTemplate = null | templateKey            ← de useTemplateClassifier
│
├── PASO 0: TemplateGallery
│   ├── Muestra allTemplates (prediseñados + usuario)
│   └── Botón "+" → TemplateUploadModal → SVGZoneConfigurator
│           │
│           └── onTemplateSaved(templateData)
│               ├── useTemplateStorage.saveTemplate()
│               └── useTemplateClassifier.addExamples()
│
├── PASO 1: CameraCapture
│   ├── [Existente] Detección de papel (OpenCV)
│   └── [NUEVO] Inferencia de template (KNN)
│       └── onTemplateDetected(templateKey, confidence)
│               └── App.jsx auto-selecciona el template
│
└── PASO 2: AnimationScene (sin cambios)
```

---

## 9. Estrategia de migración desde v1.1

La v2.0 es completamente retrocompatible. El enfoque es **extensión, no reemplazo**:

| Elemento | v1.1 | v2.0 |
|---|---|---|
| Templates prediseñados | Array en `App.jsx` | Se mantienen igual, se fusionan con los de IndexedDB |
| Selección de template | Manual siempre | Manual como fallback; automática si hay referencias |
| `useCamera.js` | Sin cambios | Sin cambios |
| Pipeline de colores | Sin cambios | Sin cambios |
| PixiJS / animaciones | Sin cambios | Sin cambios |
| `paperDetector.js` | Solo OpenCV | OpenCV + fallback ML (Fase 3) |

**Migración de datos:** No hay datos de usuario en v1.1 (sin IndexedDB). La v2.0 inicializa IndexedDB en el primer arranque sin necesidad de migración.

---

## 10. Orden de implementación recomendado

### Sprint 1 — Fundación (sin ML)
1. `useTemplateStorage.js` — IndexedDB base
2. `svgValidator.js` — validación básica
3. `svgZoneParser.js` — extracción de grupos del SVG
4. `TemplateUploadModal.jsx` — solo carga de archivo y nombre (sin configurador todavía)
5. Actualizar `TemplateGallery.jsx` — botón "+", mostrar templates guardados

**Resultado:** El usuario puede subir un SVG con `data-*` ya correctamente definidos (p.ej. hecho en Inkscape con el plugin correcto o editado a mano). El pipeline completo funciona con ese template.

### Sprint 2 — Configurador visual
6. `SVGZoneConfigurator.jsx` — preview del SVG + hit-testing de grupos
7. `ZoneConfigPanel.jsx` — controles de animación por zona
8. `svgMetaInjector.js` — generación del SVG final con data-*
9. Preview de animación en vivo dentro del configurador

**Resultado:** Cualquier persona puede subir un SVG de Figma/Illustrator y configurar las zonas visualmente sin tocar código.

### Sprint 3 — Auto-detección ML
10. `useTemplateClassifier.js` — MobileNet + KNN
11. Actualizar `TemplateUploadModal.jsx` — añadir sección de fotos de referencia
12. Actualizar `CameraCapture.jsx` — inferencia y badge de detección
13. Persistencia del modelo KNN en IndexedDB

**Resultado:** La app detecta automáticamente qué template está frente a la cámara.

### Sprint 4 — Detección de papel ML (paralelo a Sprint 2 o 3)
14. Crear carpeta `training/paper-detector/` con README
15. Escribir `scripts/train.js`
16. Tú subes las fotos de entrenamiento
17. Entrenar, evaluar, exportar modelo
18. Integrar en `paperDetector.js` como fallback

**Resultado:** La detección de papel es robusta sobre fondos claros e iluminación difícil.

---

## 11. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| MobileNet tarda en cargar (17MB) en primera visita | Alta | Medio | Lazy load solo cuando hay templates con referencias; mostrar spinner "Preparando detección automática..." |
| SVG del usuario tiene estructura incompatible (paths sueltos sin grupos) | Media | Alto | El configurador detecta paths individuales como zonas candidatas; el validador avisa con instrucciones claras |
| KNN confunde templates con apariencia similar | Media | Bajo | Umbral de confianza 0.75; fallback a selección manual siempre disponible |
| IndexedDB bloqueado en modo privado (Safari) | Baja | Medio | try/catch en toda la capa de storage; fallback a solo templates prediseñados sin crashear |
| Script de entrenamiento lento sin GPU | Baja | Bajo | ~10 min en CPU es aceptable; añadir nota en README; el modelo se incluye en el repo ya entrenado |
| Texturas VRAM insuficiente en iOS con muchos templates | Media | Alto | Limitar templates visibles simultáneamente en la galería; lazy load de SVGs en TemplateGallery |

---

*Documento generado: Mayo 2026*
*Proyecto: Libro de Colorear que Cobra Vida — v2.0*
*Stack adicional: idb + @tensorflow-models/mobilenet + @tensorflow-models/knn-classifier*
