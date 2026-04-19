const DB_NAME = "ZHReaderProDB";
const DB_VER = 1;
const STORE_NAME = "translations";

let db = null;
let inMemoryCache = new Map();

// Initialize DB
export function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = (e) => {
            const dbRef = e.target.result;
            if (!dbRef.objectStoreNames.contains(STORE_NAME)) {
                dbRef.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = (e) => {
            db = e.target.result;
            // Pre-load all to memory for fast sync access during reading
            loadAllToMemory().then(() => {
                migrateFromLocalStorage();
                resolve();
            });
        };
        req.onerror = () => reject(req.error);
    });
}

function loadAllToMemory() {
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();

        req.onsuccess = () => {
            const keys = req.result;
            const valReq = store.getAll();
            valReq.onsuccess = () => {
                const values = valReq.result;
                inMemoryCache.clear();

                let purgedCount = 0;

                for (let i = 0; i < keys.length; i++) {
                    const word = keys[i];
                    const translation = values[i];

                    // Scrub existing bad data that was saved before the regex patch
                    if (!/[\u4e00-\u9fa5]/.test(word)) {
                        store.delete(word);
                        purgedCount++;
                        continue;
                    }

                    inMemoryCache.set(word, translation);
                }

                if (purgedCount > 0) {
                    console.log(`🧹 Purged ${purgedCount} non-Chinese garbage entries from the database.`);
                }

                updateDictStats();
                updateExportLink();
                console.log(`📀 Dictionary: Loaded ${inMemoryCache.size} words from IndexedDB.`);
                resolve();
            };
        };
    });
}

function migrateFromLocalStorage() {
    const backup = localStorage.getItem("zhReaderPro_translationCache");
    if (backup) {
        try {
            const parsed = JSON.parse(backup);
            if (Array.isArray(parsed) && parsed.length > 0) {
                console.log(`🔄 Found localStorage data. Migrating ${parsed.length} entries to IndexedDB...`);
                parsed.forEach(([word, trans]) => {
                    saveTranslation(word, trans);
                });
                localStorage.removeItem("zhReaderPro_translationCache");
            }
        } catch (e) { }
    }
}

export function saveTranslation(word, translatedText) {
    // Only save words containing actual Chinese characters to prevent exporting garbage data
    if (!/[\u4e00-\u9fa5]/.test(word)) {
        return;
    }

    inMemoryCache.set(word, translatedText);
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(translatedText, word);
    updateDictStats();
    updateExportLink();
}

export function getTranslation(word) {
    return inMemoryCache.get(word);
}

// Returns true if the word exists in the local dictionary (O(1) Map lookup)
export function isWordKnown(word) {
    return inMemoryCache.has(word);
}

// We keep exportDictionary for backwards compatibility in app.js if needed,
// but handleExportClick now handles the direct click validation.
export function handleExportClick(e) {
    if (inMemoryCache.size === 0) {
        e.preventDefault();
        alert("Your dictionary is empty!");
    }
    // Since btnExportDB is an <a> tag internally wired to a blob, 
    // the default action seamlessly downloads the dictionary on Android.
}

export function updateExportLink() {
    const btn = document.getElementById("btnExportDB");
    if (!btn || inMemoryCache.size === 0) return;

    const data = JSON.stringify(Array.from(inMemoryCache.entries()));
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    if (btn.dataset.blobUrl) {
        URL.revokeObjectURL(btn.dataset.blobUrl);
    }

    btn.href = url;
    btn.download = "chinese_reader_dictionary_backup.json";
    btn.dataset.blobUrl = url;
}

export function importDictionary(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedArr = JSON.parse(e.target.result);
                if (!Array.isArray(importedArr)) throw new Error("Invalid format");
                let newWordsCount = 0;
                importedArr.forEach(([word, translated]) => {
                    if (!inMemoryCache.has(word)) newWordsCount++;
                    saveTranslation(word, translated);
                });
                updateExportLink();
                alert(`Dictionary Import Successful!\nAdded ${newWordsCount} new words.\nTotal words: ${inMemoryCache.size}`);
                resolve(newWordsCount);
            } catch (err) {
                alert("Error: Invalid dictionary backup file.");
                reject(err);
            }
        };
        reader.readAsText(file);
    });
}

export async function fetchTranslation(text) {
    if (text.length === 1 && /^[，。！？、；：""'\]》【】「」『』（）()\[\].,!?]+$/.test(text)) return "";

    // Check purely in memory
    const cached = getTranslation(text);
    if (cached) {
        console.log(`🟢 LOADED FROM CACHE: "${text}"`);
        return cached;
    }

    try {
        console.log(`🌐 FETCHING FROM GOOGLE API: "${text}"`);
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=es&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const translatedText = (await res.json())[0][0][0];
        saveTranslation(text, translatedText);
        return translatedText;
    } catch {
        return "Translation error";
    }
}

function updateDictStats() {
    const statsEl = document.getElementById("dictStats");
    if (statsEl) {
        statsEl.innerHTML = `<span class="title">My Dictionary</span><span class="subtitle">${inMemoryCache.size} words saved</span>`;
    }
}
