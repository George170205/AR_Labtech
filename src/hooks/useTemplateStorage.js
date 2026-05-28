import { useState, useEffect, useCallback } from 'react';
import { openDB } from 'idb';

const DB_NAME = 'libro-colorear-db';
const DB_VERSION = 1;
const STORE_NAME = 'templates';

// Initialize the database
const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        },
    });
};

export function useTemplateStorage() {
    const [templates, setTemplates] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadTemplates = useCallback(async () => {
        setIsLoading(true);
        try {
            const db = await initDB();
            const allUserTemplates = await db.getAll(STORE_NAME);
            setTemplates(allUserTemplates);
        } catch (error) {
            console.error('Error loading templates from IndexedDB:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTemplates();
    }, [loadTemplates]);

    const saveTemplate = async (templateData) => {
        try {
            const db = await initDB();
            const id = templateData.id || crypto.randomUUID();
            const newTemplate = {
                ...templateData,
                id,
                createdAt: templateData.createdAt || Date.now(),
                isBuiltIn: false,
            };
            await db.put(STORE_NAME, newTemplate);
            await loadTemplates(); // Reload list
            return id;
        } catch (error) {
            console.error('Error saving template:', error);
            throw error;
        }
    };

    const deleteTemplate = async (id) => {
        try {
            const db = await initDB();
            await db.delete(STORE_NAME, id);
            await loadTemplates();
        } catch (error) {
            console.error('Error deleting template:', error);
            throw error;
        }
    };

    return {
        templates,
        saveTemplate,
        deleteTemplate,
        isLoading,
    };
}
