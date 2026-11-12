import { MODULE_ID } from "../main.js";

const STORE = "cache";
let dbPromise;

function openDatabase() {
    dbPromise ??= new Promise((resolve, reject) => {
        const request = indexedDB.open(MODULE_ID, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }).catch((error) => {
        dbPromise = null;
        throw error;
    });
    return dbPromise;
}

async function transact(mode, action) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

export async function idbGet(key) {
    try {
        return await transact("readonly", (store) => store.get(key));
    } catch (error) {
        console.warn(`${MODULE_ID} | Could not read the local index cache`, error);
        return undefined;
    }
}

export async function idbSet(key, value) {
    try {
        await transact("readwrite", (store) => store.put(value, key));
    } catch (error) {
        console.warn(`${MODULE_ID} | Could not write the local index cache`, error);
    }
}
