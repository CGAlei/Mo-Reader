import { renderTranscript } from './ui.js';
import { loadAudioUrl } from './audio.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const COUNTS_KEY = 'chinread_readcounts';

// ─── State ────────────────────────────────────────────────────────────────────
// { category: { sessionName: { audio: File, json: File } } }
let librarySessions = {};
let currentAudioObjectURL = null;
export let wordsData = [];

let activeSession = null;          // { category, sessionName }
let currentView = 'tree';          // 'tree' | 'mostread'
let expandedCategories = new Set(); // categories the user has opened

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initLibrary() {
    document.getElementById('folderInput').addEventListener('change', handleFolderUpload);
    document.getElementById('btnViewTree').addEventListener('click', () => setView('tree'));
    document.getElementById('btnViewMostRead').addEventListener('click', () => setView('mostread'));
    document.getElementById('btnExportCounts').addEventListener('click', exportReadCounts);
    document.getElementById('btnImportCounts').addEventListener('click', () => document.getElementById('countsInput').click());
    document.getElementById('countsInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importReadCounts(e.target.files[0]);
            e.target.value = '';
        }
    });
    _syncToggleBtn();
    updateCountStats();
}

// ─── Read-Count Helpers ───────────────────────────────────────────────────────
function getReadCounts() {
    try { return JSON.parse(localStorage.getItem(COUNTS_KEY)) || {}; }
    catch { return {}; }
}

function trackRead(category, sessionName) {
    const counts = getReadCounts();
    const key = `${category}/${sessionName}`;
    counts[key] = (counts[key] || 0) + 1;
    localStorage.setItem(COUNTS_KEY, JSON.stringify(counts));
    updateCountStats();
}

function getReadCount(category, sessionName) {
    return getReadCounts()[`${category}/${sessionName}`] || 0;
}

function updateCountStats() {
    const el = document.getElementById('readCountStats');
    if (!el) return;
    const n = Object.keys(getReadCounts()).length;
    el.textContent = `${n} session${n !== 1 ? 's' : ''} tracked`;
}

function exportReadCounts() {
    const data = JSON.stringify(getReadCounts(), null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'chinread_session_history.json'; a.click();
    URL.revokeObjectURL(url);
}

function importReadCounts(file) {
    const fr = new FileReader();
    fr.onload = (e) => {
        try {
            const counts = JSON.parse(e.target.result);
            if (typeof counts !== 'object' || Array.isArray(counts)) throw new Error('Invalid');
            localStorage.setItem(COUNTS_KEY, JSON.stringify(counts));
            updateCountStats();
            renderCurrentView(); // refresh badges
        } catch {
            alert('Error: Invalid session history file.');
        }
    };
    fr.readAsText(file);
}

// ─── Folder Upload ────────────────────────────────────────────────────────────
function handleFolderUpload(e) {
    const files = e.target.files;
    librarySessions = {};

    for (const file of files) {
        // Expected path: RootFolder/Category/SessionName/file.ext
        const parts = file.webkitRelativePath.split('/');
        if (parts.length < 4) continue;

        const category    = parts[1];
        const sessionName = parts[2];

        if (!librarySessions[category]) librarySessions[category] = {};
        if (!librarySessions[category][sessionName])
            librarySessions[category][sessionName] = { audio: null, json: null };

        const isAudio = file.type.startsWith('audio/') ||
                        file.name.endsWith('.mp3') ||
                        file.name.endsWith('.m4a');
        if (isAudio)                   librarySessions[category][sessionName].audio = file;
        else if (file.name.endsWith('.json')) librarySessions[category][sessionName].json  = file;
    }

    // Purge incomplete sessions (missing audio or json)
    for (const cat of Object.keys(librarySessions)) {
        for (const sess of Object.keys(librarySessions[cat])) {
            const s = librarySessions[cat][sess];
            if (!s.audio || !s.json) delete librarySessions[cat][sess];
        }
        if (Object.keys(librarySessions[cat]).length === 0)
            delete librarySessions[cat];
    }

    renderCurrentView();
}

// ─── View Toggle ──────────────────────────────────────────────────────────────
function setView(view) {
    currentView = view;
    _syncToggleBtn();
    renderCurrentView();
}

function _syncToggleBtn() {
    document.getElementById('btnViewTree')?.classList.toggle('active', currentView === 'tree');
    document.getElementById('btnViewMostRead')?.classList.toggle('active', currentView === 'mostread');
}

function renderCurrentView() {
    if (currentView === 'tree') renderTreeView();
    else renderMostReadView();
}

// ─── Tree View ────────────────────────────────────────────────────────────────
function renderTreeView() {
    const list = document.getElementById('sessionList');
    list.innerHTML = '';

    const categories = Object.keys(librarySessions).sort();

    if (categories.length === 0) {
        list.innerHTML = '<div class="empty-state" style="font-size:14px;margin-top:20px;">No Audio + JSON pairs found.</div>';
        return;
    }

    const frag = document.createDocumentFragment();

    categories.forEach(category => {
        const sessions      = librarySessions[category];
        const sessionNames  = Object.keys(sessions).sort();
        const isExpanded    = expandedCategories.has(category) ||
                             (activeSession?.category === category);

        // ── Category group wrapper ──
        const group = document.createElement('div');
        group.className = 'category-group';
        group.id = `cat-${category}`;

        // ── Category header ──
        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = `
            <span class="category-chevron">${isExpanded ? '▼' : '▶'}</span>
            <span class="category-icon">📂</span>
            <span class="category-name">${category}</span>
            <span class="category-count">${sessionNames.length}</span>
        `;
        header.addEventListener('click', () => _toggleCategory(category));

        // ── Category body (collapsible) ──
        const body = document.createElement('div');
        body.className = `category-body${isExpanded ? ' open' : ''}`;
        body.id = `catbody-${category}`;

        sessionNames.forEach(sessionName => {
            body.appendChild(_buildSessionItem(category, sessionName, 'tree'));
        });

        group.appendChild(header);
        group.appendChild(body);
        frag.appendChild(group);
    });

    list.appendChild(frag);
}

// ─── Most Read View ───────────────────────────────────────────────────────────
function renderMostReadView() {
    const list = document.getElementById('sessionList');
    list.innerHTML = '';

    const counts = getReadCounts();
    const all = [];

    for (const cat of Object.keys(librarySessions)) {
        for (const sess of Object.keys(librarySessions[cat])) {
            all.push({ category: cat, sessionName: sess, count: counts[`${cat}/${sess}`] || 0 });
        }
    }

    if (all.length === 0) {
        list.innerHTML = '<div class="empty-state" style="font-size:14px;margin-top:20px;">No sessions loaded.</div>';
        return;
    }

    // Sort: most read first, then alphabetical
    all.sort((a, b) => b.count - a.count || a.sessionName.localeCompare(b.sessionName));

    const frag = document.createDocumentFragment();
    all.forEach(({ category, sessionName }) => {
        frag.appendChild(_buildSessionItem(category, sessionName, 'mostread'));
    });
    list.appendChild(frag);
}

// ─── Shared Session Item Builder ──────────────────────────────────────────────
function _buildSessionItem(category, sessionName, viewMode) {
    const count    = getReadCount(category, sessionName);
    const isActive = activeSession?.category === category &&
                     activeSession?.sessionName === sessionName;

    const item = document.createElement('div');
    item.className = `session-item${isActive ? ' active' : ''}`;
    item.id = `${viewMode}-${category}-${sessionName}`;

    if (viewMode === 'tree') {
        item.innerHTML = `
            <span class="session-icon">🎧</span>
            <span class="session-name">${sessionName}</span>
            ${count > 0 ? `<span class="session-badge">${count}</span>` : ''}
        `;
    } else {
        // Most-read: show category as subtitle + fire icon if read
        item.innerHTML = `
            <span class="session-icon">${count > 0 ? '🔥' : '🎧'}</span>
            <div class="session-meta">
                <span class="session-name">${sessionName}</span>
                <span class="session-category-label">${category}</span>
            </div>
            ${count > 0 ? `<span class="session-badge">${count}×</span>` : ''}
        `;
    }

    item.addEventListener('click', () => loadSession(category, sessionName));
    return item;
}

// ─── Category Collapse/Expand ─────────────────────────────────────────────────
function _toggleCategory(category) {
    const body    = document.getElementById(`catbody-${category}`);
    const group   = document.getElementById(`cat-${category}`);
    const chevron = group?.querySelector('.category-chevron');
    if (!body) return;

    if (expandedCategories.has(category)) {
        expandedCategories.delete(category);
        body.classList.remove('open');
        if (chevron) chevron.textContent = '▶';
    } else {
        expandedCategories.add(category);
        body.classList.add('open');
        if (chevron) chevron.textContent = '▼';
    }
}

// ─── Load Session ─────────────────────────────────────────────────────────────
function loadSession(category, sessionName) {
    const session = librarySessions[category]?.[sessionName];
    if (!session) return;

    // Track + update state
    trackRead(category, sessionName);
    activeSession = { category, sessionName };
    expandedCategories.add(category); // keep tree open on switch-back

    // Re-render view to update badges + active state cleanly
    renderCurrentView();

    // Auto-close mobile sidebar
    if (document.body.classList.contains('sidebar-open')) {
        document.body.classList.remove('sidebar-open');
        const btn = document.getElementById('hamburgerBtn');
        if (btn) btn.textContent = '☰';
    }

    // Audio
    if (currentAudioObjectURL) URL.revokeObjectURL(currentAudioObjectURL);
    currentAudioObjectURL = URL.createObjectURL(session.audio);
    loadAudioUrl(currentAudioObjectURL);

    // JSON → transcript
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const json = JSON.parse(reader.result);
            parse(json);
            renderTranscript(wordsData);
        } catch (err) {
            document.getElementById('transcript').innerHTML = 'Error parsing JSON file.';
            console.error(err);
        }
    };
    reader.readAsText(session.json);
}

// ─── JSON Parser ──────────────────────────────────────────────────────────────
function parse(json) {
    let sourceArray = [];
    // Prefer segments[].words — it contains untimed punctuation tokens (，。！ etc.)
    // word_segments is a flat Whisper alignment array that strips all punctuation.
    if (json.segments && Array.isArray(json.segments) && json.segments[0]?.words) {
        json.segments.forEach((s) => {
            if (s.words && s.words.length > 0) {
                s.words[0].isSegmentStart = true;
                sourceArray.push(...s.words);
            }
        });
    } else if (json.word_segments && Array.isArray(json.word_segments)) {
        sourceArray = json.word_segments;
    } else if (Array.isArray(json)) {
        sourceArray = json;
    }

    wordsData = [];
    let lastKnownEnd = 0;

    for (let i = 0; i < sourceArray.length; i++) {
        const w = sourceArray[i];
        if (!w || !w.word || w.word.trim() === '') continue;

        let start, end;
        if (w.timestamp !== undefined) {
            start = w.timestamp / 1000;
            end   = sourceArray[i + 1] ? sourceArray[i + 1].timestamp / 1000 : start + 0.8;
        } else {
            start = w.start !== undefined ? w.start : lastKnownEnd;
            if (w.end !== undefined) {
                end = w.end;
            } else {
                let nextStart = start + 0.1;
                for (let j = i + 1; j < sourceArray.length; j++) {
                    if (sourceArray[j].start !== undefined) { nextStart = sourceArray[j].start; break; }
                }
                end = nextStart;
            }
        }
        lastKnownEnd = end;
        wordsData.push({ text: w.word.trim(), start, end, isSegmentStart: w.isSegmentStart });
    }
}
