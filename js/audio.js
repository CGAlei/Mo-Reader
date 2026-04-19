import { syncTranscript } from './ui.js';

export let isPlaying = false;
let syncAnimationFrame = null;
let playerElement = null;

export function initAudio() {
    playerElement = document.getElementById("audioPlayer");
    const playBtn = document.getElementById("playBtn");
    const seekBar = document.getElementById("seekBar");
    const currentTimeDisplay = document.getElementById("currentTimeDisplay");
    const totalTimeDisplay = document.getElementById("totalTimeDisplay");

    playBtn.onclick = togglePlay;
    
    playerElement.onplay = () => {
        isPlaying = true;
        playBtn.textContent = "⏸";
        startSyncLoop();
    };
    
    playerElement.onpause = () => {
        isPlaying = false;
        playBtn.textContent = "▶";
        cancelAnimationFrame(syncAnimationFrame);
    };
    
    playerElement.onloadedmetadata = () => {
        seekBar.max = playerElement.duration;
        totalTimeDisplay.textContent = formatTime(playerElement.duration);
    };
    
    playerElement.ontimeupdate = () => {
        seekBar.value = playerElement.currentTime;
        currentTimeDisplay.textContent = formatTime(playerElement.currentTime);
    };
    
    seekBar.oninput = () => { 
        playerElement.currentTime = seekBar.value; 
    };
    
    playerElement.onseeked = () => {
        // Trigger manual sync pass
        syncTranscript(playerElement.currentTime);
    };
}

export function loadAudioUrl(url) {
    if(!playerElement) return;
    playerElement.src = url;
    playerElement.pause();
}

export function playAudioAt(time) {
    if(!playerElement) return;
    playerElement.currentTime = time;
    playerElement.play();
}

function togglePlay() {
    if (playerElement.paused) { 
        playerElement.play(); 
    } else { 
        playerElement.pause(); 
    }
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function startSyncLoop() {
    function loop() {
        if (!isPlaying) return;
        syncTranscript(playerElement.currentTime);
        syncAnimationFrame = requestAnimationFrame(loop);
    }
    syncAnimationFrame = requestAnimationFrame(loop);
}
