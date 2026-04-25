// DOM Elements
const btnLoad    = document.getElementById('btnLoad');
const fileInput  = document.getElementById('fileInput');
const btnExport  = document.getElementById('btnExport');
const editorArea = document.getElementById('editorArea');
const emptyState = document.getElementById('emptyState');
const statusMsg  = document.getElementById('statusMsg');
const wordCount  = document.getElementById('wordCount');
const charCount  = document.getElementById('charCount');

// Global State
let originalJson = null;
let spokenWords = [];
let loadedFileName = "edited_transcription.json";

// Initialization
function init() {
    btnLoad.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileLoad);
    btnExport.addEventListener('click', handleExport);
    editorArea.addEventListener('input', updateCharCount);
}

function handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;

    loadedFileName = file.name;
    // Show filename in the header badge
    if (wordCount) wordCount.textContent = `📄 ${file.name}`;
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            originalJson = JSON.parse(e.target.result);
            processJsonToText();
        } catch (err) {
            console.error("Error parsing JSON:", err);
            showStatus("Invalid JSON file", true);
        }
    };
    reader.readAsText(file);
}

function processJsonToText() {
    emptyState.style.display = 'none';
    editorArea.style.display = 'block';
    btnExport.disabled = false;
    spokenWords = [];

    let sourceWords = [];              // flat list of all word tokens in display order
    let segmentStartIndices = new Set(); // indices where a new segment begins

    // ── Format 1: { segments: [ { words: [...] } ] }  ← standard Whisper output
    if (originalJson && originalJson.segments && Array.isArray(originalJson.segments)) {
        const segsWithWords = originalJson.segments.filter(s => Array.isArray(s.words) && s.words.length > 0);
        if (segsWithWords.length > 0) {
            segsWithWords.forEach(seg => {
                segmentStartIndices.add(sourceWords.length);
                seg.words.forEach(w => sourceWords.push(w));
            });
        }
    }

    // ── Format 2: { word_segments: [...] }  ← flat timed array
    if (sourceWords.length === 0 && originalJson && originalJson.word_segments && Array.isArray(originalJson.word_segments)) {
        segmentStartIndices.add(0);
        sourceWords = originalJson.word_segments;
    }

    // ── Format 3: raw array  [{ word, start, end }, ...]
    if (sourceWords.length === 0 && Array.isArray(originalJson)) {
        segmentStartIndices.add(0);
        sourceWords = originalJson;
    }

    if (sourceWords.length === 0) {
        showStatus("Could not parse JSON — unknown format", true);
        btnExport.disabled = true;
        return;
    }

    // Build display text and collect spoken (timed) words
    let fullText = "";
    sourceWords.forEach((w, idx) => {
        if (!w || !w.word) return;
        if (segmentStartIndices.has(idx) && idx > 0) fullText += "\n\n";
        if (w.start !== undefined) spokenWords.push(w);
        fullText += w.word;
    });

    editorArea.value = fullText;
    updateCharCount();
    if (wordCount) wordCount.textContent = `📄 ${loadedFileName}  ·  ${spokenWords.length} spoken words`;
    showStatus('JSON loaded — edit punctuation and paragraph breaks, then Export.');
}

function handleExport() {
    if (!originalJson || spokenWords.length === 0) return;

    const editedText = editorArea.value;

    // --- Robust Alignment Logic ---
    // We walk through `spokenWords` in order. For each spoken word, we search
    // FORWARD from ptr. Any characters between ptr and the found index form
    // the "gap" — this gap may contain punctuation the user added/changed, and
    // newlines the user pressed to split paragraphs.
    //
    // KEY FIX: when `indexOf` fails for a word (user deleted it), we STILL
    // advance ptr by at least 0 and insert the spoken word inline so the
    // pointer stays valid for future words.

    let newSegments = [];
    let currentSegment = { start: -1, end: -1, text: "", words: [] };
    let ptr = 0;

    function flushGap(gap) {
        // Split on newline groups; each newline group = segment boundary
        if (!gap) return;
        const parts = gap.split(/(\n+)/);
        for (const part of parts) {
            if (/^\n/.test(part)) {
                // Paragraph break — close current segment
                if (currentSegment.words.length > 0) {
                    newSegments.push(currentSegment);
                    currentSegment = { start: -1, end: -1, text: "", words: [] };
                }
            } else {
                const punct = part.replace(/\s+/g, "");
                if (punct) {
                    currentSegment.words.push({ word: punct });
                    currentSegment.text += punct;
                }
            }
        }
    }

    function addSpokenWord(sw) {
        if (currentSegment.start === -1) currentSegment.start = sw.start;
        currentSegment.end = sw.end;
        currentSegment.words.push(sw);
        currentSegment.text += sw.word;
    }

    for (let i = 0; i < spokenWords.length; i++) {
        const sw = spokenWords[i];
        const idx = editedText.indexOf(sw.word, ptr);

        if (idx !== -1) {
            // Found the word at the correct position
            const gap = editedText.substring(ptr, idx);
            flushGap(gap);
            addSpokenWord(sw);
            ptr = idx + sw.word.length;
        } else {
            // Word not found (user deleted it). Insert it silently to keep
            // timeline continuity — don't advance ptr so next search starts
            // from the same position.
            console.warn(`Word not found: '${sw.word}' at ptr=${ptr} — inserting without gap.`);
            addSpokenWord(sw);
            // ptr stays unchanged; keep scanning from same position
        }
    }

    // Handle any trailing text after the last spoken word
    const tailGap = editedText.substring(ptr);
    flushGap(tailGap);

    // Push the final segment
    if (currentSegment.words.length > 0) {
        newSegments.push(currentSegment);
    }

    // Reconstruct root JSON (preserve all original top-level fields)
    const reconstructedJson = { ...originalJson, segments: newSegments };

    // Trigger Download
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reconstructedJson, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);

    let outFileName = loadedFileName;
    if (!outFileName.startsWith("edited_")) outFileName = "edited_" + outFileName;
    a.setAttribute("download", outFileName);

    document.body.appendChild(a);
    a.click();
    a.remove();

    showStatus(`Exported! ${newSegments.length} segment${newSegments.length !== 1 ? 's' : ''} written.`);
}

function updateCharCount() {
    if (!charCount) return;
    const txt = editorArea.value;
    const chars = txt.replace(/\s/g, '').length;
    charCount.textContent = chars > 0 ? `${chars.toLocaleString()} chars` : '';
}

function showStatus(text, isError = false) {
    statusMsg.textContent = text;
    statusMsg.style.background = isError ? "#ef4444" : "var(--highlight)";
    statusMsg.classList.add('show');
    
    setTimeout(() => {
        statusMsg.classList.remove('show');
    }, 3000);
}

// Start app
document.addEventListener('DOMContentLoaded', init);
