import { useState, useEffect, useCallback } from 'react';
import { openDB } from 'idb';

const DB_NAME = 'knn-classifier-db';
const DB_VERSION = 1;
const STORE_NAME = 'state';

// Initialize the database for KNN
const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        },
    });
};

// Global singletons
let mobilenetInstance = null;
let knnInstance = null;
let tfInstance = null;
let loadingPromise = null;

export function useTemplateClassifier() {
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [exampleCount, setExampleCount] = useState(new Map());

    // Update example counts based on knn classifier state
    const updateCounts = useCallback(() => {
        if (!knnInstance) return;
        const counts = knnInstance.getClassExampleCount();
        const map = new Map();
        Object.entries(counts).forEach(([label, count]) => {
            map.set(label, count);
        });
        setExampleCount(map);
    }, []);

    // Load everything lazily
    const initClassifier = useCallback(async () => {
        if (isReady) return;
        if (loadingPromise) {
            await loadingPromise;
            setIsReady(true);
            updateCounts();
            return;
        }

        setIsLoading(true);

        loadingPromise = (async () => {
            try {
                tfInstance = await import('@tensorflow/tfjs');
                const mobilenetLib = await import('@tensorflow-models/mobilenet');
                const knnClassifier = await import('@tensorflow-models/knn-classifier');
                
                if (!mobilenetInstance) {
                    mobilenetInstance = await mobilenetLib.load({ version: 2, alpha: 1.0 });
                }
                
                if (!knnInstance) {
                    knnInstance = knnClassifier.create();
                    // Try to restore state
                    const db = await initDB();
                    const serialized = await db.get(STORE_NAME, 'classifier_state');
                    if (serialized) {
                        const dataset = {};
                        for (const [key, { data, shape }] of Object.entries(serialized)) {
                            dataset[key] = tfInstance.tensor2d(data, shape);
                        }
                        knnInstance.setClassifierDataset(dataset);
                    }
                }
            } catch (err) {
                console.error("Error loading template classifier:", err);
            }
        })();

        await loadingPromise;
        setIsReady(true);
        setIsLoading(false);
        updateCounts();
    }, [isReady, updateCounts]);

    // Ensure we start loading if not ready
    useEffect(() => {
        initClassifier();
    }, [initClassifier]);

    const getEmbedding = (imageElement) => {
        return mobilenetInstance.infer(imageElement, true);
    };

    const persistKNNState = async () => {
        if (!knnInstance) return;
        const dataset = knnInstance.getClassifierDataset();
        const serialized = {};
        for (const [key, tensor] of Object.entries(dataset)) {
            serialized[key] = {
                data: Array.from(tensor.dataSync()),
                shape: tensor.shape,
            };
        }
        const db = await initDB();
        await db.put(STORE_NAME, serialized, 'classifier_state');
        updateCounts();
    };

    const addExamples = async (templateId, imageBlobs) => {
        if (!isReady) await initClassifier();
        
        for (const blob of imageBlobs) {
            // Convert Blob to HTMLImageElement
            const img = await blobToImageElement(blob);
            const embedding = getEmbedding(img);
            knnInstance.addExample(embedding, templateId);
            embedding.dispose();
        }
        await persistKNNState();
    };

    const predict = async (imageElement) => {
        if (!isReady || !knnInstance) return null;
        if (knnInstance.getNumClasses() < 2) return null; // Need at least 2 templates

        const embedding = getEmbedding(imageElement);
        const result = await knnInstance.predictClass(embedding);
        embedding.dispose();
        
        return {
            templateId: result.label,
            confidence: result.confidences[result.label],
            allConfidences: result.confidences,
        };
    };

    const removeTemplate = async (templateId) => {
        if (!isReady || !knnInstance) return;
        if (knnInstance.getNumClasses() > 0 && knnInstance.getClassExampleCount()[templateId]) {
            knnInstance.clearClass(templateId);
            await persistKNNState();
        }
    };

    return {
        isReady,
        isLoading,
        addExamples,
        predict,
        removeTemplate,
        exampleCount,
    };
}

// Helper to load Blob into an image element
function blobToImageElement(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
    });
}
