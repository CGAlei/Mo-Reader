import { initDB, handleExportClick, importDictionary } from './dict.js';
import { initAudio } from './audio.js';
import { initLibrary } from './library.js';
import { initUI } from './ui.js';

document.addEventListener("DOMContentLoaded", () => {
    // Setup Dictionary bindings
    document.getElementById("btnExportDB").addEventListener("click", handleExportClick);
    document.getElementById("btnImportDB").addEventListener("click", () => {
        document.getElementById("dictInput").click();
    });
    document.getElementById("dictInput").addEventListener("change", (e) => {
        if(e.target.files.length > 0) {
            importDictionary(e.target.files[0]).then(() => {
                e.target.value = ""; // Reset input
            });
        }
    });

    // Setup App Flow
    initUI();
    initAudio();
    initLibrary();
    
    initDB().then(() => {
        console.log("App Initialized successfully!");
    }).catch(err => {
        console.error("Failed to initialize Dictionary DB:", err);
    });
});
