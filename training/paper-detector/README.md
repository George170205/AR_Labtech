# Detector de Papel — Guía de entrenamiento
### Libro de Colorear que Cobra Vida v2.0

Este modelo aprende a detectar si hay una hoja de papel visible en la imagen de la cámara. Se usa como **fallback** cuando OpenCV falla en fondos claros o con mala iluminación.

---

## Tabla de contenidos

1. [Instalar Python en Windows](#1-instalar-python-en-windows)
2. [Crear el entorno virtual](#2-crear-el-entorno-virtual)
3. [Instalar dependencias](#3-instalar-dependencias)
4. [Preparar las fotos de entrenamiento](#4-preparar-las-fotos-de-entrenamiento)
5. [Entrenar el modelo](#5-entrenar-el-modelo)
6. [Evaluar el modelo](#6-evaluar-el-modelo)
7. [Integrar en la app](#7-integrar-en-la-app)
8. [Solución de problemas](#8-solución-de-problemas)

---

## 1. Instalar Python en Windows

> Si ya tienes Python 3.10, 3.11 o 3.12 instalado, salta al paso 2.
> Comprueba con: `python --version` en la terminal.

1. Ve a [https://www.python.org/downloads/](https://www.python.org/downloads/)
2. Descarga **Python 3.11.x** (recomendado — mejor compatibilidad con TensorFlow)
3. Ejecuta el instalador
4. **IMPORTANTE:** Marca la casilla **"Add Python to PATH"** antes de hacer clic en Install
5. Verifica la instalación:

```cmd
python --version
pip --version
```

Deberías ver algo como `Python 3.11.9` y `pip 24.x`.

---

## 2. Crear el entorno virtual

Un entorno virtual aísla las dependencias de este proyecto del resto de tu sistema. Evita conflictos con otros proyectos y mantiene todo limpio.

Abre una terminal (`cmd` o PowerShell) **en esta carpeta** (`training/paper-detector/`) y ejecuta:

```cmd
python -m venv venv
```

Esto crea una carpeta `venv/` con Python aislado. Ahora actívalo:

```cmd
venv\Scripts\activate
```

Sabrás que está activo porque el prompt cambia a:
```
(venv) C:\...\training\paper-detector>
```

> Cada vez que abras una terminal nueva para trabajar con estos scripts, debes activar el entorno virtual de nuevo con `venv\Scripts\activate`.

---

## 3. Instalar dependencias

Con el entorno virtual activo:

```cmd
pip install -r requirements.txt
```

Esto instala TensorFlow, tensorflowjs, Pillow y el resto de paquetes. Tardará 2–5 minutos dependiendo de tu conexión.

**Verificar que todo quedó bien:**
```cmd
python -c "import tensorflow as tf; print('TF:', tf.__version__)"
python -c "import tensorflowjs; print('TFJS converter: OK')"
```

Deberías ver:
```
TF: 2.15.0
TFJS converter: OK
```

---

## 4. Preparar las fotos de entrenamiento

Esta es la parte más importante. La calidad y variedad de las fotos determina la calidad del modelo.

### Estructura de carpetas

```
data/
├── positive/     ← fotos CON hoja de papel visible
└── negative/     ← fotos SIN hoja de papel
```

### Carpeta `positive/` — fotos CON papel

Toma fotos de una hoja de papel blanca sobre distintas superficies y condiciones:

| Variación | Por qué importa |
|---|---|
| Mesa de madera oscura | El caso fácil — buen contraste |
| Mesa clara o blanca | El caso difícil que queremos resolver |
| Mesa de vidrio | Reflexiones y transparencias |
| Tela o alfombra | Fondo texturizado |
| Con luz natural | Condición más común |
| Con luz artificial (foco, lámpara) | Condición en interiores |
| Con sombra parcial sobre el papel | Caso muy común en uso real |
| Papel en blanco | Sin dibujo |
| Papel con dibujo coloreado | Con el dibujo real |
| Ángulo frontal (cámara mirando directo hacia abajo) | Uso ideal |
| Ángulo de 15–30° de inclinación | Uso real — nadie sostiene el teléfono perfecto |
| Distancia 30 cm | Teléfono cerca |
| Distancia 60–80 cm | Teléfono lejos |

**Mínimo recomendado:** 60 fotos. Con 100+ el modelo mejora notablemente.

### Carpeta `negative/` — fotos SIN papel

Fotos de lo que NO debe detectarse como papel:

| Ejemplo | Por qué incluirlo |
|---|---|
| Mesa vacía (mismas superficies que positive) | El caso más confundible |
| Libro o cuaderno cerrado | Superficie rectangular similar |
| Manos sobre la mesa | Aparece frecuentemente en uso real |
| Pantalla de tablet o laptop | Falso positivo muy común |
| Fondo de sala o cuarto | Cuando el niño mueve la cámara |
| Cama o sofá | Uso real en casa |
| Piso o alfombra | Cámara apuntando hacia abajo sin papel |
| Papel arrugado o muy doblado | Para que el modelo sea robusto |

**Mínimo recomendado:** 60 fotos. Trata de equiparar la cantidad con `positive/`.

### Formato y nombres

JPG, JPEG, PNG o WEBP. Las fotos se redimensionan automáticamente a 224×224 durante el entrenamiento. Cualquier nombre de archivo sirve (los nombres del teléfono como `IMG_1234.jpg` funcionan perfecto).

---

## 5. Entrenar el modelo

Con el entorno virtual activo y las fotos en su lugar:

```cmd
python scripts/train.py
```

El script hace todo automáticamente:

1. Verifica que haya suficientes fotos
2. Aplica aumentación de datos (rotaciones, brillo, zoom)
3. Entrena en dos fases: primero solo el clasificador, luego fine-tuning
4. Muestra las métricas finales
5. Genera una gráfica de las curvas de entrenamiento
6. Exporta el modelo en formato TFJS listo para la app

**Tiempo estimado:**
- Sin GPU (CPU): 15–25 minutos
- Con GPU NVIDIA con CUDA: 2–4 minutos

**Ejemplo de salida:**

```
===========================================================
  Detector de Papel — Entrenamiento
  Libro de Colorear que Cobra Vida v2.0
===========================================================

💻 Usando CPU. El entrenamiento tardará ~10–20 minutos.

📁 Datos encontrados:
   ✅ Positivos (con papel): 78 imágenes
   ❌ Negativos (sin papel): 71 imágenes

📊 División del dataset:
   Entrenamiento: 119 imágenes
   Validación:    30 imágenes
   ...

RESULTADOS FINALES
   Accuracy: 94.3%
   AUC:      0.9821

✅ Modelo listo para producción (accuracy ≥ 90%)

✅ Modelo exportado a formato TFJS:
   model/tfjs/model.json
   model/tfjs/group1-shard1of1.bin
```

---

## 6. Evaluar el modelo

### Evaluación general con el dataset

```cmd
python scripts/evaluate.py
```

Muestra una grilla visual con las imágenes, la predicción del modelo y si acertó o no. Se guarda como `model/evaluacion_visual.png`.

### Probar una imagen específica

```cmd
python scripts/evaluate.py "C:\ruta\a\mi\foto.jpg"
```

Útil para probar con fotos que el modelo nunca vio durante el entrenamiento. Es la mejor forma de verificar si el modelo funcionará bien en condiciones reales.

---

## 7. Integrar en la app

Una vez que el modelo tiene accuracy ≥ 85%, está listo.

### Paso 1 — Copiar los archivos del modelo

```
AR_Laboratorio/
└── public/
    └── paper-detector-model/     ← crear esta carpeta
        ├── model.json
        ├── group1-shard1of1.bin
        └── meta.json
```

Desde esta carpeta, ejecuta:
```cmd
xcopy /E /I model\tfjs "..\..\public\paper-detector-model"
```

O cópialos manualmente desde el Explorador de archivos.

### Paso 2 — La app lo detecta automáticamente

`paperDetector.js` carga el modelo desde `/paper-detector-model/model.json` si existe. Si la carpeta no está, la app sigue funcionando solo con OpenCV (comportamiento normal de v1.1). No hay configuración adicional.

### Paso 3 — Verificar en el navegador

Abre la consola del navegador al usar la app. Si el modelo cargó correctamente verás:
```
[paperDetector] Modelo ML cargado — accuracy: 94.3% | umbral: 0.60
```

---

## 8. Solución de problemas

**`python` no se reconoce como comando**
Reinstala Python marcando "Add Python to PATH". O usa `py` en lugar de `python`.

**Error: `Microsoft Visual C++ 14.0 is required`**
Instala las Build Tools de Visual Studio desde:
https://visualstudio.microsoft.com/visual-cpp-build-tools/
Selecciona "Desarrollo de escritorio con C++" durante la instalación.

**El entrenamiento se queda sin memoria (MemoryError)**
Reduce el tamaño del batch en `train.py`: cambia `BATCH_SIZE = 16` a `BATCH_SIZE = 8`.

**Accuracy baja (< 80%)**
Causas más comunes:
- Pocas imágenes (añade más, especialmente de los casos que falla)
- Poca variedad en las fotos (iluminación, ángulo, superficie)
- Desbalance de clases (cantidad muy diferente entre positive y negative)
- Las fotos de `negative/` no cubren los casos reales de uso

**`venv\Scripts\activate` da error de permisos en PowerShell**
Ejecuta PowerShell como administrador y corre:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
Luego vuelve a intentar activar el entorno.

---

*Libro de Colorear que Cobra Vida v2.0*
*Stack de entrenamiento: Python 3.11 + TensorFlow 2.15 + tensorflowjs 4.15*
