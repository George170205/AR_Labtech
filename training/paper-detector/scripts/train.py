"""
train.py — Entrenamiento del modelo de detección de papel
Libro de Colorear que Cobra Vida v2.0

Uso:
    python scripts/train.py

Requisitos:
    pip install -r requirements.txt
    Fotos en:
        data/positive/  ← hojas de papel visibles
        data/negative/  ← fondos sin papel
"""

import os
import sys
import json
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
from tqdm import tqdm

import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from PIL import Image

# ─── Configuración ────────────────────────────────────────────────────────────

BASE_DIR    = Path(__file__).parent.parent          # training/paper-detector/
DATA_DIR    = BASE_DIR / "data"
MODEL_DIR   = BASE_DIR / "model"
SCRIPTS_DIR = BASE_DIR / "scripts"

IMG_SIZE    = (224, 224)   # Tamaño de entrada de MobileNetV2
BATCH_SIZE  = 16
EPOCHS      = 25
PATIENCE    = 5            # Early stopping
SEED        = 42

# ─── Verificación de datos ────────────────────────────────────────────────────

def verificar_datos():
    pos_dir = DATA_DIR / "positive"
    neg_dir = DATA_DIR / "negative"

    if not pos_dir.exists() or not neg_dir.exists():
        print("\n❌ ERROR: No se encontraron las carpetas de datos.")
        print(f"   Crea estas carpetas y añade tus fotos:")
        print(f"   {pos_dir}  ← fotos CON hoja de papel")
        print(f"   {neg_dir}  ← fotos SIN hoja de papel")
        sys.exit(1)

    extensiones = {'.jpg', '.jpeg', '.png', '.webp', '.bmp'}
    pos_imgs = [f for f in pos_dir.iterdir() if f.suffix.lower() in extensiones]
    neg_imgs = [f for f in neg_dir.iterdir() if f.suffix.lower() in extensiones]

    print(f"\n📁 Datos encontrados:")
    print(f"   ✅ Positivos (con papel): {len(pos_imgs)} imágenes")
    print(f"   ❌ Negativos (sin papel): {len(neg_imgs)} imágenes")

    if len(pos_imgs) < 10 or len(neg_imgs) < 10:
        print("\n⚠️  ADVERTENCIA: Se recomienda al menos 60 imágenes por categoría.")
        print("   Con pocas imágenes el modelo puede no generalizar bien.")
        respuesta = input("   ¿Continuar de todas formas? (s/n): ").strip().lower()
        if respuesta != 's':
            sys.exit(0)

    if len(pos_imgs) < 3 or len(neg_imgs) < 3:
        print("\n❌ ERROR: Necesitas al menos 3 imágenes por categoría para entrenar.")
        sys.exit(1)

    return len(pos_imgs), len(neg_imgs)


# ─── Preparación del dataset ──────────────────────────────────────────────────

def crear_generadores():
    """
    Crea generadores de datos con aumentación para el entrenamiento
    y sin aumentación para la validación.
    """

    # Aumentación agresiva para mejorar robustez
    train_datagen = ImageDataGenerator(
        rescale=1.0 / 255,
        validation_split=0.20,          # 80% entrenamiento, 20% validación
        rotation_range=15,              # rotaciones leves de la cámara
        width_shift_range=0.1,
        height_shift_range=0.1,
        brightness_range=[0.6, 1.4],    # simula diferente iluminación
        zoom_range=0.15,
        horizontal_flip=True,
        fill_mode='nearest',
    )

    val_datagen = ImageDataGenerator(
        rescale=1.0 / 255,
        validation_split=0.20,
    )

    train_gen = train_datagen.flow_from_directory(
        DATA_DIR,
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode='binary',            # papel(1) / no-papel(0)
        subset='training',
        seed=SEED,
        shuffle=True,
    )

    val_gen = val_datagen.flow_from_directory(
        DATA_DIR,
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode='binary',
        subset='validation',
        seed=SEED,
        shuffle=False,
    )

    print(f"\n📊 División del dataset:")
    print(f"   Entrenamiento: {train_gen.samples} imágenes")
    print(f"   Validación:    {val_gen.samples} imágenes")
    print(f"   Clases:        {train_gen.class_indices}")

    return train_gen, val_gen


# ─── Construcción del modelo ──────────────────────────────────────────────────

def construir_modelo():
    """
    Transfer learning sobre MobileNetV2 preentrenado con ImageNet.
    Congelamos las capas base y añadimos un clasificador binario encima.
    """

    print("\n🧠 Construyendo modelo...")

    # Base: MobileNetV2 preentrenado (pesos de ImageNet, sin capa final)
    base = MobileNetV2(
        input_shape=(*IMG_SIZE, 3),
        include_top=False,
        weights='imagenet',
    )
    base.trainable = False  # Congelar pesos base

    # Clasificador añadido
    modelo = keras.Sequential([
        base,
        layers.GlobalAveragePooling2D(),
        layers.BatchNormalization(),
        layers.Dense(128, activation='relu'),
        layers.Dropout(0.4),
        layers.Dense(64, activation='relu'),
        layers.Dropout(0.3),
        layers.Dense(1, activation='sigmoid'),   # 1 = hay papel, 0 = no hay papel
    ], name='paper_detector')

    modelo.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss='binary_crossentropy',
        metrics=['accuracy', keras.metrics.AUC(name='auc')],
    )

    print(f"   Parámetros totales:     {modelo.count_params():,}")
    print(f"   Parámetros entrenables: {sum(p.numpy().size for p in modelo.trainable_variables):,}")

    return modelo, base


# ─── Entrenamiento ────────────────────────────────────────────────────────────

def entrenar(modelo, base, train_gen, val_gen):
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    checkpoint_path = MODEL_DIR / "mejor_modelo.keras"

    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor='val_loss',
            patience=PATIENCE,
            mode='min',
            restore_best_weights=True,
            verbose=1,
        ),
        keras.callbacks.ModelCheckpoint(
            filepath=str(checkpoint_path),
            monitor='val_loss',
            save_best_only=True,
            mode='min',
            verbose=0,
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=3,
            min_lr=1e-6,
            verbose=1,
        ),
    ]

    # ── Fase 1: Solo entrenar el clasificador (base congelada) ──
    print(f"\n{'='*55}")
    print(f"  FASE 1 — Entrenando clasificador (base MobileNet fija)")
    print(f"{'='*55}")

    historia1 = modelo.fit(
        train_gen,
        epochs=EPOCHS,
        validation_data=val_gen,
        callbacks=callbacks,
        verbose=1,
    )

    # ── Fase 2: Fine-tuning — descongelar las últimas 30 capas ──
    print(f"\n{'='*55}")
    print(f"  FASE 2 — Fine-tuning (últimas 30 capas de MobileNet)")
    print(f"{'='*55}")

    base.trainable = True
    for capa in base.layers[:-30]:
        capa.trainable = False

    modelo.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-5),  # LR más bajo
        loss='binary_crossentropy',
        metrics=['accuracy', keras.metrics.AUC(name='auc')],
    )

    historia2 = modelo.fit(
        train_gen,
        epochs=15,
        validation_data=val_gen,
        callbacks=callbacks,
        verbose=1,
    )

    return historia1, historia2


# ─── Evaluación ───────────────────────────────────────────────────────────────

def evaluar(modelo, val_gen):
    print(f"\n{'='*55}")
    print(f"  RESULTADOS FINALES")
    print(f"{'='*55}")

    resultados = modelo.evaluate(val_gen, verbose=0)
    loss, acc, auc = resultados

    print(f"   Loss:     {loss:.4f}")
    print(f"   Accuracy: {acc*100:.1f}%")
    print(f"   AUC:      {auc:.4f}")

    if acc >= 0.90:
        print("\n   ✅ Modelo listo para producción (accuracy ≥ 90%)")
    elif acc >= 0.80:
        print("\n   ⚠️  Modelo aceptable (accuracy ≥ 80%). Añadir más fotos mejorará el resultado.")
    else:
        print("\n   ❌ Modelo débil (accuracy < 80%). Revisa las fotos y añade más variedad.")

    return acc


# ─── Graficar curvas ──────────────────────────────────────────────────────────

def graficar(historia1, historia2):
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    fig.suptitle('Curvas de entrenamiento — Detector de papel', fontsize=13)

    # Combinar historias de las dos fases
    acc  = historia1.history['accuracy']  + historia2.history['accuracy']
    vacc = historia1.history['val_accuracy'] + historia2.history['val_accuracy']
    loss = historia1.history['loss']      + historia2.history['loss']
    vloss= historia1.history['val_loss']  + historia2.history['val_loss']
    epochs = range(1, len(acc) + 1)
    separador = len(historia1.history['accuracy'])

    axes[0].plot(epochs, acc,  label='Entrenamiento')
    axes[0].plot(epochs, vacc, label='Validación')
    axes[0].axvline(separador, color='gray', linestyle='--', label='Fine-tuning')
    axes[0].set_title('Accuracy')
    axes[0].set_xlabel('Época')
    axes[0].legend()
    axes[0].set_ylim([0, 1])

    axes[1].plot(epochs, loss,  label='Entrenamiento')
    axes[1].plot(epochs, vloss, label='Validación')
    axes[1].axvline(separador, color='gray', linestyle='--', label='Fine-tuning')
    axes[1].set_title('Loss')
    axes[1].set_xlabel('Época')
    axes[1].legend()

    plt.tight_layout()
    grafica_path = MODEL_DIR / "curvas_entrenamiento.png"
    plt.savefig(grafica_path, dpi=120)
    print(f"\n📈 Gráfica guardada en: {grafica_path}")
    plt.show()


# ─── Exportar a formato TFJS ──────────────────────────────────────────────────

def exportar_tfjs(modelo, accuracy):
    try:
        import tensorflowjs as tfjs

        tfjs_dir = MODEL_DIR / "tfjs"
        tfjs_dir.mkdir(parents=True, exist_ok=True)

        tfjs.converters.save_keras_model(modelo, str(tfjs_dir))

        print(f"\n✅ Modelo exportado a formato TFJS:")
        print(f"   {tfjs_dir}/model.json")
        print(f"   {tfjs_dir}/group1-shard*.bin")
        print(f"\n📋 Próximo paso:")
        print(f"   Copia toda la carpeta '{tfjs_dir}' a:")
        print(f"   AR_Laboratorio/public/paper-detector-model/")

        # Guardar metadatos del modelo
        meta = {
            "version": "1.0",
            "accuracy": round(float(accuracy), 4),
            "imgSize": list(IMG_SIZE),
            "classes": {"0": "no_paper", "1": "paper"},
            "threshold": 0.6,
            "description": "Detector de hoja de papel sobre mesa — Libro de Colorear v2.0"
        }
        with open(tfjs_dir / "meta.json", "w") as f:
            json.dump(meta, f, indent=2)

        print(f"\n   También copia: {tfjs_dir}/meta.json")

    except ImportError:
        print("\n⚠️  tensorflowjs no está instalado.")
        print("   Ejecuta: pip install tensorflowjs")
        print("   Luego corre este script de nuevo.")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 55)
    print("  Detector de Papel — Entrenamiento")
    print("  Libro de Colorear que Cobra Vida v2.0")
    print("=" * 55)

    # Verificar GPU
    gpus = tf.config.list_physical_devices('GPU')
    if gpus:
        print(f"\n🚀 GPU detectada: {gpus[0].name}")
        print(f"   El entrenamiento será mucho más rápido.")
    else:
        print(f"\n💻 Usando CPU. El entrenamiento tardará ~10–20 minutos.")
        print(f"   (Con GPU NVIDIA sería ~2–3 minutos)")

    n_pos, n_neg = verificar_datos()
    train_gen, val_gen = crear_generadores()
    modelo, base = construir_modelo()
    historia1, historia2 = entrenar(modelo, base, train_gen, val_gen)
    accuracy = evaluar(modelo, val_gen)
    graficar(historia1, historia2)
    exportar_tfjs(modelo, accuracy)

    print(f"\n{'='*55}")
    print(f"  ¡Entrenamiento completado!")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    main()
