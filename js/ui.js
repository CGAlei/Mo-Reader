import { fetchTranslation, isWordKnown } from './dict.js';
import { playAudioAt, isPlaying } from './audio.js';
import { animate, spring } from "https://cdn.jsdelivr.net/npm/motion@10/+esm";

let wordElements = [];
// For optimized O(1) sync loop
let currentWordIndex = -1;

let currentAnimStyle = "pop";
const isTouchDevice = window.matchMedia("(hover: none)").matches;
let tappedWord = null;
let hoverTimeout;
const { pinyin } = window.pinyinPro;

export function initUI() {
    setupSettings();
    setupSidebarFocus();
    setupFullscreen();
    showFocusHint(3000);
}

function setupSettings() {
    const root = document.documentElement;
    const body = document.body;

    document.getElementById("themeSelect").addEventListener("change", (e) => {
        root.setAttribute("data-theme", e.target.value);
        root.style.removeProperty("--highlight");
        setTimeout(() => {
            const computedColor = getComputedStyle(root).getPropertyValue("--highlight").trim();
            if (computedColor && computedColor.startsWith("#") && computedColor.length === 7) {
                document.getElementById("colorSelect").value = computedColor;
            }
        }, 50);
    });
        
    document.getElementById("colorSelect").addEventListener("input", (e) =>
        root.style.setProperty("--highlight", e.target.value));
        
    document.getElementById("activeStyleSelect").addEventListener("change", (e) =>
        body.setAttribute("data-active-style", e.target.value));
        
    document.getElementById("fontSelect").addEventListener("change", (e) =>
        root.style.setProperty("--reader-font-family", e.target.value));
        
    document.getElementById("sizeSelect").addEventListener("input", (e) =>
        root.style.setProperty("--font-size", e.target.value + "px"));
        
    document.getElementById("animSelect").addEventListener("change", (e) =>
        (currentAnimStyle = e.target.value));

    // ── Dictionary highlight toggle ──
    const dictHighlightBtn = document.getElementById("dictHighlightBtn");
    if (dictHighlightBtn) {
        // Restore saved state
        const saved = localStorage.getItem("chinread_dicthighlight") === "1";
        if (saved) {
            document.body.classList.add("dict-highlight");
            dictHighlightBtn.classList.add("active");
        }
        dictHighlightBtn.addEventListener("click", () => {
            const isOn = document.body.classList.toggle("dict-highlight");
            dictHighlightBtn.classList.toggle("active", isOn);
            localStorage.setItem("chinread_dicthighlight", isOn ? "1" : "0");
        });
    }
}

function setupSidebarFocus() {
    const body = document.body;
    
    function toggleFocusMode() {
        body.classList.toggle("focus-mode");
        showFocusHint(1500);
    }

    document.getElementById("collapseBtn").addEventListener("click", toggleFocusMode);
    document.getElementById("reopenBtn").addEventListener("click", toggleFocusMode);

    document.addEventListener("keydown", (e) => {
        const tag = document.activeElement.tagName;
        const isTyping = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
        if (isTyping) return;
        if (e.key === "a" || e.key === "A") {
            e.preventDefault();
            toggleFocusMode();
        }
    });

    const hamburgerBtn = document.getElementById("hamburgerBtn");
    if(hamburgerBtn) {
        hamburgerBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            body.classList.toggle("sidebar-open");
            hamburgerBtn.textContent = body.classList.contains("sidebar-open") ? "✕" : "☰";
        });
    }

    document.addEventListener("click", (e) => {
        if (body.classList.contains("sidebar-open") &&
            !e.target.closest(".sidebar") &&
            e.target !== hamburgerBtn) {
            body.classList.remove("sidebar-open");
            if(hamburgerBtn) hamburgerBtn.textContent = "☰";
        }
    });
    
    if (isTouchDevice) {
        const tooltip = document.getElementById("tooltip");
        document.addEventListener("click", () => {
            tappedWord = null;
            tooltip.classList.remove("show");
        });
        tooltip.addEventListener("click", () => {
            tappedWord = null;
            tooltip.classList.remove("show");
        });
    }
}

function setupFullscreen() {
    const fullscreenBtn = document.getElementById("fullscreenBtn");
    if(!fullscreenBtn) return;
    
    fullscreenBtn.addEventListener("click", async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen({ navigationUI: "hide" });
            } else {
                await document.exitFullscreen();
            }
        } catch (err) {
            console.warn("Fullscreen request failed:", err);
        }
    });

    document.addEventListener("fullscreenchange", () => {
        fullscreenBtn.textContent = document.fullscreenElement ? "✕" : "⛶";
        fullscreenBtn.title = document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen";
    });
}

let focusHintTimer = null;
function showFocusHint(duration = 2000) {
    const hint = document.getElementById("focusHint");
    if(!hint) return;
    hint.classList.add("visible");
    clearTimeout(focusHintTimer);
    focusHintTimer = setTimeout(() => hint.classList.remove("visible"), duration);
}

export function renderTranscript(wordsData) {
    const transcript = document.getElementById("transcript");
    const tooltip = document.getElementById("tooltip");
    transcript.innerHTML = "";
    wordElements = [];
    currentWordIndex = -1;

    // Use DocumentFragment for faster DOM rendering
    const fragment = document.createDocumentFragment();

    wordsData.forEach((w) => {
        if (w.isSegmentStart && wordElements.length > 0) {
            // Subtle paragraph divider — much tighter than two <br> elements
            const br = document.createElement('div');
            br.className = 'segment-break';
            fragment.appendChild(br);
        }

        const span = document.createElement("span");
        span.className = "word";
        span.textContent = w.text;

        const isClosingPunctuation = /^[，。！？、；："'\]》】」』）.,!?]+$/.test(w.text);
        const isOpeningPunctuation = /^["'\[《【「『（(]+$/.test(w.text);
        if (isClosingPunctuation) span.style.margin = "0 4px 0 0";
        else if (isOpeningPunctuation) span.style.margin = "0 0 0 4px";

        // Mark words that exist in the local dictionary.
        // Length guard: single-char words are almost always particles/pronouns
        // (的, 到, 好…) — not worth highlighting for intermediate learners.
        if (w.text.length > 1 && isWordKnown(w.text)) span.classList.add('word--known');

        if (isTouchDevice) {
            span.addEventListener("click", (e) => {
                e.stopPropagation();
                if (tappedWord === span) {
                    tappedWord = null;
                    tooltip.classList.remove("show");
                    playAudioAt(w.start);
                } else {
                    tappedWord = span;
                    showTooltip(span, w.text, tooltip);
                }
            });
        } else {
            span.onclick = () => playAudioAt(w.start);
            span.onmouseenter = () => { hoverTimeout = setTimeout(() => showTooltip(span, w.text, tooltip), 150); };
            span.onmouseleave = () => { clearTimeout(hoverTimeout); tooltip.classList.remove("show"); };
        }

        fragment.appendChild(span);
        wordElements.push({ span, start: w.start, end: w.end });
    });
    
    transcript.appendChild(fragment);
}

async function showTooltip(span, text, tooltip) {
    if (text.length === 1 && /^[，。！？、；：""'\]》【】「」『』（）()\[\].,!?]+$/.test(text)) return;
    const py = window.pinyinPro ? window.pinyinPro.pinyin(text, { toneType: "symbol" }) : "";
    const rect = span.getBoundingClientRect();
    tooltip.style.left = rect.left + rect.width / 2 + "px";
    tooltip.style.top = rect.top - 10 + "px";
    tooltip.innerHTML = `<div class="pinyin">${py}</div><div class="english loading">Translating...</div>`;
    tooltip.classList.add("show");
    
    // Now fetch translation
    const englishWord = await fetchTranslation(text);
    if (tooltip.classList.contains("show")) {
        tooltip.innerHTML = `<div class="pinyin">${py}</div><div class="english">${englishWord}</div>`;
    }
}

function animateIn(el) {
    if (currentAnimStyle === "spring") {
        animate(el,
            { transform: ["scale(1)", "scale(1.15)", "scale(1)"], y: [0, -6, 0] },
            { easing: spring({ stiffness: 400, damping: 10 }) }
        );
    } else if (currentAnimStyle === "pop") {
        animate(el, { transform: ["scale(1)", "scale(1.2)", "scale(1)"] }, { duration: 0.2 });
    } else if (currentAnimStyle === "smooth") {
        animate(el, { y: [0, -4, 0] }, { duration: 0.3, easing: "ease-in-out" });
    }
}

// Optimized O(1) sync loop explicitly matching timestamps
export function syncTranscript(currentTime) {
    if (wordElements.length === 0) return;
    
    // Fast path: Check if we are still inside the bounds of the current word
    if (currentWordIndex !== -1) {
        const cw = wordElements[currentWordIndex];
        if (currentTime >= cw.start && currentTime < cw.end) {
            return; // Still in the same word
        }
    }
    
    // Fallback search: Need to find the correct active index
    let newIndex = -1;
    for (let i = 0; i < wordElements.length; i++) {
        const w = wordElements[i];
        if (currentTime >= w.start && currentTime < w.end) {
            newIndex = i;
            break;
        }
    }
    
    if (newIndex !== currentWordIndex) {
        if (currentWordIndex !== -1) {
            wordElements[currentWordIndex].span.classList.remove("active");
        }
        
        currentWordIndex = newIndex;
        
        if (newIndex !== -1) {
            const w = wordElements[newIndex];
            w.span.classList.add("active");
            animateIn(w.span);
            
            if (newIndex + 1 < wordElements.length) {
                wordElements[newIndex + 1].span.classList.add("next");
            }
            if (newIndex > 0) {
                wordElements[newIndex - 1].span.classList.remove("next");
            }
            
            // Only scroll if actually playing
            if(isPlaying) {
                w.span.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }
    }
}
