import * as tf from '@tensorflow/tfjs-node';
import * as mobilenet from '@tensorflow-models/mobilenet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POSITIVE_DIR = path.join(__dirname, '../data/positive');
const NEGATIVE_DIR = path.join(__dirname, '../data/negative');
const MODEL_DIR = path.join(__dirname, '../model');

const IMAGE_SIZE = 224; // MobileNet v2 input size

async function loadImage(imagePath) {
    const buffer = fs.readFileSync(imagePath);
    // Decode image and resize to 224x224
    const tfimage = tf.node.decodeImage(buffer, 3);
    const resized = tf.image.resizeBilinear(tfimage, [IMAGE_SIZE, IMAGE_SIZE]);
    // Normalize to [-1, 1] which is what MobileNet expects
    const normalized = resized.div(127.5).sub(1);
    tfimage.dispose();
    return normalized;
}

async function loadDataset() {
    const xs = [];
    const ys = [];

    // Load positive images (label = 1)
    if (fs.existsSync(POSITIVE_DIR)) {
        const posFiles = fs.readdirSync(POSITIVE_DIR).filter(f => f.match(/\.(jpg|jpeg|png)$/i));
        for (const file of posFiles) {
            const img = await loadImage(path.join(POSITIVE_DIR, file));
            xs.push(img);
            ys.push(1);
        }
        console.log(`Cargadas ${posFiles.length} imágenes POSITIVAS`);
    }

    // Load negative images (label = 0)
    if (fs.existsSync(NEGATIVE_DIR)) {
        const negFiles = fs.readdirSync(NEGATIVE_DIR).filter(f => f.match(/\.(jpg|jpeg|png)$/i));
        for (const file of negFiles) {
            const img = await loadImage(path.join(NEGATIVE_DIR, file));
            xs.push(img);
            ys.push(0);
        }
        console.log(`Cargadas ${negFiles.length} imágenes NEGATIVAS`);
    }

    if (xs.length === 0) {
        throw new Error('No se encontraron imágenes en data/positive o data/negative');
    }

    // Stack all images into a single tensor [N, 224, 224, 3]
    const xTensor = tf.stack(xs);
    const yTensor = tf.tensor1d(ys, 'float32');

    // Shuffle the dataset
    const indices = tf.util.createShuffledIndices(xs.length);
    const shuffledX = tf.gather(xTensor, indices);
    const shuffledY = tf.gather(yTensor, indices);

    xTensor.dispose();
    yTensor.dispose();
    xs.forEach(t => t.dispose());

    return { x: shuffledX, y: shuffledY };
}

async function run() {
    console.log("Cargando MobileNet...");
    const baseModel = await mobilenet.load({ version: 2, alpha: 1.0 });
    
    // Use an intermediate layer as feature extractor
    const layer = baseModel.model.getLayer('conv_pw_13_relu');
    const truncated = tf.model({
        inputs: baseModel.model.inputs,
        outputs: layer.output,
    });
    truncated.trainable = false; // Freeze MobileNet weights

    console.log("Construyendo modelo clasificador...");
    const model = tf.sequential({
        layers: [
            truncated,
            tf.layers.globalAveragePooling2d({}),
            tf.layers.dense({ units: 128, activation: 'relu' }),
            tf.layers.dropout({ rate: 0.3 }),
            tf.layers.dense({ units: 1, activation: 'sigmoid' }),
        ],
    });

    model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy'],
    });

    console.log("Cargando dataset...");
    const dataset = await loadDataset();

    console.log("Iniciando entrenamiento...");
    await model.fit(dataset.x, dataset.y, {
        epochs: 20,
        batchSize: 8,
        validationSplit: 0.2,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                console.log(`Epoch ${epoch + 1} - loss: ${logs.loss.toFixed(4)} - acc: ${logs.acc.toFixed(4)} - val_loss: ${logs.val_loss.toFixed(4)} - val_acc: ${logs.val_acc.toFixed(4)}`);
            }
        }
    });

    console.log("Guardando modelo...");
    await model.save(`file://${MODEL_DIR}`);
    console.log("Entrenamiento completado. Modelo guardado en:", MODEL_DIR);

    dataset.x.dispose();
    dataset.y.dispose();
}

run().catch(console.error);
