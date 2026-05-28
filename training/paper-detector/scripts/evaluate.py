"""
evaluate.py — Evalúa el modelo entrenado con imágenes de prueba
Libro de Colorear que Cobra Vida v2.0

Uso:
    python scripts/evaluate.py                        ← evalúa con el set de validación
    python scripts/evaluate.py ruta/a/imagen.jpg      ← prueba una imagen específica
"""

import sys
import json
import numpy as np
from pathlib import Path
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from PIL import Image

import tensorflow as tf
import tensorflowjs as tfjs

BASE_DIR  = Path(__file__).parent.parent
MODEL_DIR = BASE_DIR / "model"
DATA_DIR  = BASE_DIR / "data"
IMG_SIZE  = (224, 224)

# ─── Cargar modelo ────────────────────────────────────────────────────────────

def cargar_modelo():
    keras_path = MODEL_DIR / "mejor_modelo.keras"
    if not keras_path.exists():
        print("❌ No se encontró el modelo entrenado.")
        print(f"   Ejecuta primero: python scripts/train.py")
        sys.exit(1)

    modelo = tf.keras.models.load_model(str(keras_path))
    print(f"✅ Modelo cargado: {keras_path.name}")
    return modelo


# ─── Predecir una imagen ──────────────────────────────────────────────────────

def predecir_imagen(modelo, ruta_imagen, umbral=0.6):
    img = Image.open(ruta_imagen).convert("RGB").resize(IMG_SIZE)
    arr = np.array(img) / 255.0
    arr = np.expand_dims(arr, axis=0)

    prob = float(modelo.predict(arr, verbose=0)[0][0])
    hay_papel = prob >= umbral
    confianza = prob if hay_papel else 1 - prob

    return {
        "ruta": str(ruta_imagen),
        "probabilidad": round(prob, 4),
        "hay_papel": hay_papel,
        "confianza": round(confianza, 4),
        "etiqueta": "✅ PAPEL" if hay_papel else "❌ NO HAY PAPEL",
    }


# ─── Evaluar con varias imágenes de prueba ────────────────────────────────────

def evaluar_batch(modelo, max_por_clase=10):
    resultados = {"correctos": 0, "incorrectos": 0, "detalles": []}

    for clase, etiqueta_real in [("positive", True), ("negative", False)]:
        carpeta = DATA_DIR / clase
        if not carpeta.exists():
            continue

        imagenes = list(carpeta.glob("*.jpg")) + list(carpeta.glob("*.png")) + list(carpeta.glob("*.jpeg"))
        imagenes = imagenes[:max_por_clase]

        for img_path in imagenes:
            r = predecir_imagen(modelo, img_path)
            correcto = r["hay_papel"] == etiqueta_real
            r["correcto"] = correcto
            r["etiqueta_real"] = "PAPEL" if etiqueta_real else "NO PAPEL"

            if correcto:
                resultados["correctos"] += 1
            else:
                resultados["incorrectos"] += 1

            resultados["detalles"].append(r)

    total = resultados["correctos"] + resultados["incorrectos"]
    resultados["accuracy"] = resultados["correctos"] / total if total > 0 else 0

    return resultados


# ─── Mostrar resultados visuales ──────────────────────────────────────────────

def mostrar_resultados(resultados):
    detalles = resultados["detalles"]
    n = min(len(detalles), 12)

    cols = 4
    rows = (n + cols - 1) // cols
    fig, axes = plt.subplots(rows, cols, figsize=(14, rows * 3.5))
    fig.suptitle(
        f'Evaluación del modelo — Accuracy: {resultados["accuracy"]*100:.1f}%',
        fontsize=13
    )

    axes_flat = axes.flatten() if hasattr(axes, 'flatten') else [axes]

    for i, detalle in enumerate(detalles[:n]):
        ax = axes_flat[i]
        img = Image.open(detalle["ruta"]).convert("RGB").resize((200, 200))
        ax.imshow(img)

        color = "green" if detalle["correcto"] else "red"
        titulo = f'{detalle["etiqueta"]}\n({detalle["confianza"]*100:.0f}% conf.)'
        ax.set_title(titulo, fontsize=8, color=color, fontweight='bold')

        for spine in ax.spines.values():
            spine.set_edgecolor(color)
            spine.set_linewidth(3)

        ax.set_xticks([])
        ax.set_yticks([])

    # Ocultar ejes sobrantes
    for i in range(n, len(axes_flat)):
        axes_flat[i].set_visible(False)

    plt.tight_layout()
    out_path = MODEL_DIR / "evaluacion_visual.png"
    plt.savefig(out_path, dpi=100)
    print(f"\n📊 Evaluación visual guardada en: {out_path}")
    plt.show()


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    modelo = cargar_modelo()

    if len(sys.argv) > 1:
        # Modo imagen individual
        ruta = Path(sys.argv[1])
        if not ruta.exists():
            print(f"❌ No se encontró el archivo: {ruta}")
            sys.exit(1)

        r = predecir_imagen(modelo, ruta)
        print(f"\n{'='*45}")
        print(f"  Imagen: {ruta.name}")
        print(f"  Resultado: {r['etiqueta']}")
        print(f"  Probabilidad de papel: {r['probabilidad']*100:.1f}%")
        print(f"  Confianza: {r['confianza']*100:.1f}%")
        print(f"{'='*45}\n")

    else:
        # Modo batch con el dataset
        print("\nEvaluando con imágenes del dataset...")
        resultados = evaluar_batch(modelo, max_por_clase=6)

        print(f"\n{'='*45}")
        print(f"  RESULTADOS DE EVALUACIÓN")
        print(f"{'='*45}")
        print(f"  Correctos:   {resultados['correctos']}")
        print(f"  Incorrectos: {resultados['incorrectos']}")
        print(f"  Accuracy:    {resultados['accuracy']*100:.1f}%")

        # Mostrar errores si los hay
        errores = [d for d in resultados["detalles"] if not d["correcto"]]
        if errores:
            print(f"\n  ⚠️  Imágenes mal clasificadas ({len(errores)}):")
            for e in errores:
                nombre = Path(e["ruta"]).name
                print(f"     {nombre}: predijo '{e['etiqueta']}' pero era '{e['etiqueta_real']}'")

        mostrar_resultados(resultados)


if __name__ == "__main__":
    main()
