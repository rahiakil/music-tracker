const LIBRARY = [
  { id: "1-OpeningTrack01", file: "1-OpeningTrack01.mp3", label: "OpeningTrack01" },
  { id: "2-Doorbell1", file: "2-Doorbell1.mp3", label: "Doorbell1" },
  { id: "3-Doorbell2", file: "3-Doorbell2.mp3", label: "Doorbell2" },
  { id: "5-Track02", file: "5-Track02.mp3", label: "Track 02" },
  { id: "6-Track03", file: "6-Track03.mp3", label: "Track 03" },
  { id: "7-Track04", file: "7-Track04.mp3", label: "Track 04" },
  { id: "8-mixTrack05", file: "8-mixTrack05.mp3", label: "mix Track 05" },
  { id: "9-Track07", file: "9-Track07.mp3", label: "Track 07" },
].map((t) => ({ ...t, src: `tracks/${t.file}` }));

const DEFAULT_SEQUENCE = LIBRARY.map((t) => t.id);
const STORAGE_KEY = "brishchik-sequence-v4";
const VOLUME_KEY = "brishchik-volume-v1";
const SLOT_COUNT = 8;

const player = document.getElementById("player");
const libraryEl = document.getElementById("library");
const sequenceEl = document.getElementById("sequence");
const titleEl = document.getElementById("now-title");
const metaEl = document.getElementById("now-meta");
const seekInput = document.getElementById("seek");
const elapsedEl = document.getElementById("time-elapsed");
const totalEl = document.getElementById("time-total");
const playBtn = document.getElementById("btn-play");
const prevBtn = document.getElementById("btn-prev");
const nextBtn = document.getElementById("btn-next");
const fadeInBtn = document.getElementById("btn-fade-in");
const fadeOutBtn = document.getElementById("btn-fade-out");
const revertBtn = document.getElementById("btn-revert");
const volumeInput = document.getElementById("volume");
const volumeValue = document.getElementById("volume-value");

const byId = Object.fromEntries(LIBRARY.map((t) => [t.id, t]));
const durations = Object.fromEntries(LIBRARY.map((t) => [t.id, null]));
const FADE_MS = 3000;

let sequence = loadSequence();
let index = 0;
let dragPayload = null;
let fadeRaf = 0;
let fading = null;
let targetVolume = loadVolume();
let seeking = false;
let playRequest = 0;
let suppressCueClick = false;

function loadSequence() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_SEQUENCE];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== SLOT_COUNT) return [...DEFAULT_SEQUENCE];
    const cleaned = parsed.filter((id) => byId[id]);
    if (cleaned.length !== SLOT_COUNT) return [...DEFAULT_SEQUENCE];
    if (new Set(cleaned).size !== SLOT_COUNT) return [...DEFAULT_SEQUENCE];
    return cleaned;
  } catch {
    return [...DEFAULT_SEQUENCE];
  }
}

function saveSequence() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sequence));
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function currentTrack() {
  return byId[sequence[index]] || null;
}

function activeTrackId() {
  return sequence[index] || null;
}

function preloadDurations() {
  LIBRARY.forEach((track) => {
    const probe = new Audio();
    probe.preload = "metadata";
    probe.src = track.src;
    const commit = () => {
      if (Number.isFinite(probe.duration) && probe.duration > 0) {
        durations[track.id] = probe.duration;
        updateDurationDisplays(track.id);
      }
    };
    probe.addEventListener("loadedmetadata", commit);
    probe.addEventListener("durationchange", commit);
    probe.load();
  });
}

function updateDurationDisplays(trackId) {
  const text = formatTime(durations[trackId]);
  sequenceEl.querySelectorAll(`[data-track-id="${trackId}"] .cue-dur`).forEach((el) => {
    el.textContent = text;
  });
  libraryEl.querySelectorAll(`[data-track-id="${trackId}"] .music-btn-dur`).forEach((el) => {
    el.textContent = text;
  });
  if (activeTrackId() === trackId && (player.paused || !player.src)) {
    totalEl.textContent = text;
  }
}

function renderLibrary() {
  libraryEl.innerHTML = "";
  const activeId = activeTrackId();
  const playing = !player.paused && !player.ended && !!player.src;

  LIBRARY.forEach((track) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "music-btn";
    btn.draggable = true;
    btn.dataset.trackId = track.id;

    const isActive = track.id === activeId;
    if (isActive) btn.classList.add("is-linked");
    if (isActive && playing) btn.classList.add("is-playing");

    const slot = sequence.indexOf(track.id);
    const cueLabel = isActive
      ? `<span class="link-badge">Cue ${index + 1}</span>`
      : slot >= 0
        ? `<span class="slot-badge">${slot + 1}</span>`
        : "";

    btn.innerHTML = `
      <span class="music-btn-main">
        <span class="music-btn-name">${track.label}</span>
        <span class="music-btn-file">${track.file}</span>
        <span class="music-btn-dur">${formatTime(durations[track.id])}</span>
      </span>
      ${cueLabel}
    `;
    btn.title = isActive
      ? `Cue ${index + 1} means this file`
      : "Drag onto a sequence cue to place it there";

    btn.addEventListener("dragstart", (e) => onLibraryDragStart(e, track.id));
    btn.addEventListener("dragend", clearDragState);
    libraryEl.appendChild(btn);
  });
}

function renderSequence() {
  sequenceEl.innerHTML = "";

  sequence.forEach((id, i) => {
    const track = byId[id];
    if (!track) return;
    const li = document.createElement("li");
    li.className = "cue-item";
    if (i === index) li.classList.add("is-active");
    if (i === index && !player.paused && !player.ended) li.classList.add("is-playing");
    li.draggable = true;
    li.dataset.index = String(i);
    li.dataset.trackId = id;

    const cueBtn = document.createElement("button");
    cueBtn.type = "button";
    cueBtn.className = "cue-btn";
    cueBtn.innerHTML = `
      <span class="cue-num">${i + 1}</span>
      <span class="cue-copy">
        <span class="cue-name">${track.label}</span>
        <span class="cue-file">${track.file}</span>
      </span>
      <span class="cue-dur">${formatTime(durations[track.id])}</span>
    `;
    cueBtn.setAttribute("aria-label", `Cue ${i + 1}: ${track.file}`);
    cueBtn.addEventListener("click", (event) => {
      if (suppressCueClick) {
        event.preventDefault();
        suppressCueClick = false;
        return;
      }
      selectTrack(i, true);
    });

    li.append(cueBtn);
    li.addEventListener("dragstart", (e) => {
      suppressCueClick = true;
      onSequenceDragStart(e, i);
    });
    li.addEventListener("dragend", () => {
      clearDragState();
      // Keep the synthetic click after a drag from starting audio.
      setTimeout(() => {
        suppressCueClick = false;
      }, 0);
    });
    li.addEventListener("dragover", (e) => onSequenceDragOver(e, i));
    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
    li.addEventListener("drop", (e) => onSequenceDrop(e, i));
    sequenceEl.appendChild(li);
  });

  renderLibrary();
}

function onLibraryDragStart(e, trackId) {
  dragPayload = { type: "library", trackId };
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", trackId);
  sequenceEl.classList.add("is-drop-target");
}

function onSequenceDragStart(e, fromIndex) {
  dragPayload = { type: "sequence", fromIndex };
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(fromIndex));
}

function onSequenceDragOver(e, overIndex) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  [...sequenceEl.children].forEach((el, i) => {
    el.classList.toggle("drag-over", i === overIndex);
  });
}

function onSequenceDrop(e, toIndex) {
  e.preventDefault();
  e.stopPropagation();
  const payload = dragPayload;
  clearDragState();
  dragPayload = null;

  if (payload?.type === "library") {
    placeTrackOnSlot(payload.trackId, toIndex);
    return;
  }
  if (payload?.type === "sequence") {
    swapSlots(payload.fromIndex, toIndex);
    return;
  }

  const raw = e.dataTransfer.getData("text/plain");
  if (byId[raw]) placeTrackOnSlot(raw, toIndex);
}

function clearDragState() {
  sequenceEl.classList.remove("is-drop-target");
  [...sequenceEl.children].forEach((el) => el.classList.remove("drag-over"));
}

/** Drop a library file onto cue N: swap that file into slot N. */
function placeTrackOnSlot(trackId, slotIndex) {
  if (!byId[trackId]) return;
  const fromIndex = sequence.indexOf(trackId);
  if (fromIndex === -1 || fromIndex === slotIndex) return;
  swapSlots(fromIndex, slotIndex);
}

function swapSlots(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const next = [...sequence];
  const tmp = next[fromIndex];
  next[fromIndex] = next[toIndex];
  next[toIndex] = tmp;
  sequence = next;

  if (index === fromIndex) index = toIndex;
  else if (index === toIndex) index = fromIndex;

  saveSequence();
  renderSequence();
  selectTrack(index, false);
}

function syncNowLabel() {
  titleEl.textContent = String(index + 1);
}

function loadVolume() {
  try {
    const raw = Number(localStorage.getItem(VOLUME_KEY));
    if (Number.isFinite(raw)) return Math.max(0, Math.min(1, raw));
  } catch {
    /* keep default */
  }
  return 1;
}

function saveVolume() {
  localStorage.setItem(VOLUME_KEY, String(targetVolume));
}

function syncVolumeUi(level = targetVolume) {
  const pct = Math.round(Math.max(0, Math.min(1, level)) * 100);
  if (volumeInput) volumeInput.value = String(pct);
  if (volumeValue) volumeValue.textContent = `${pct}%`;
}

function stopFade() {
  if (fadeRaf) cancelAnimationFrame(fadeRaf);
  fadeRaf = 0;
  fading = null;
  fadeInBtn?.classList.remove("is-fading");
  fadeOutBtn?.classList.remove("is-fading");
}

function setVolume(level, { syncUi = false } = {}) {
  player.volume = Math.max(0, Math.min(1, level));
  if (syncUi) syncVolumeUi(player.volume);
}

function runFade({ from, to, label, onDone }) {
  stopFade();
  fading = label;
  if (label === "in") fadeInBtn?.classList.add("is-fading");
  if (label === "out") fadeOutBtn?.classList.add("is-fading");
  setVolume(from);
  const started = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - started) / FADE_MS);
    setVolume(from + (to - from) * t);
    if (t < 1) {
      fadeRaf = requestAnimationFrame(tick);
      return;
    }
    setVolume(to);
    fading = null;
    fadeInBtn?.classList.remove("is-fading");
    fadeOutBtn?.classList.remove("is-fading");
    fadeRaf = 0;
    if (onDone) onDone();
  };
  fadeRaf = requestAnimationFrame(tick);
}

async function fadeIn() {
  if (!player.src) selectTrack(index, false);
  stopFade();
  setVolume(0);
  metaEl.textContent = "Fading in…";
  try {
    await player.play();
  } catch {
    metaEl.textContent = "Tap Fade in again";
    setVolume(targetVolume, { syncUi: true });
    return;
  }
  runFade({
    from: 0,
    to: targetVolume,
    label: "in",
    onDone: () => {
      metaEl.textContent = "Playing";
    },
  });
}

function fadeOut() {
  if (!player.src || player.paused) {
    metaEl.textContent = "Nothing playing";
    return;
  }
  const from = player.volume > 0 ? player.volume : targetVolume;
  metaEl.textContent = "Fading out…";
  runFade({
    from,
    to: 0,
    label: "out",
    onDone: () => {
      player.pause();
      setVolume(targetVolume, { syncUi: true });
      metaEl.textContent = "Faded out";
      updatePlayButton();
    },
  });
}

function trackDuration() {
  const live = player.duration;
  if (Number.isFinite(live) && live > 0) return live;
  return durations[activeTrackId()] || 0;
}

function syncSeekUi(seconds = player.currentTime || 0) {
  const dur = trackDuration();
  if (!seekInput) return;
  seekInput.max = dur ? String(dur) : "0";
  if (!seeking) seekInput.value = String(Math.min(dur || 0, Math.max(0, seconds)));
  const pct = dur ? Math.max(0, Math.min(100, (Number(seekInput.value) / dur) * 100)) : 0;
  seekInput.style.setProperty("--seek-pct", `${pct}%`);
  elapsedEl.textContent = formatTime(Number(seekInput.value) || 0);
  if (dur) totalEl.textContent = formatTime(dur);
}

function seekTo(seconds) {
  const dur = trackDuration();
  if (!dur) return;
  const next = Math.max(0, Math.min(dur, seconds));
  player.currentTime = next;
  syncSeekUi(next);
}

function waitForCanPlay() {
  if (player.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("load"));
    };
    const cleanup = () => {
      player.removeEventListener("canplay", onReady);
      player.removeEventListener("loadeddata", onReady);
      player.removeEventListener("error", onError);
    };
    player.addEventListener("canplay", onReady, { once: true });
    player.addEventListener("loadeddata", onReady, { once: true });
    player.addEventListener("error", onError, { once: true });
  });
}

async function startPlayback(requestId) {
  try {
    await waitForCanPlay();
    if (requestId !== playRequest) return;
    await player.play();
  } catch {
    if (requestId !== playRequest) return;
    metaEl.textContent = "Tap Play";
    updatePlayButton();
  }
}

function selectTrack(i, autoplay) {
  stopFade();
  seeking = false;
  setVolume(targetVolume, { syncUi: true });
  index = Math.max(0, Math.min(sequence.length - 1, i));
  const track = currentTrack();
  if (!track) return;
  const requestId = ++playRequest;
  syncNowLabel();
  metaEl.textContent = autoplay ? "Loading…" : "Selected";
  elapsedEl.textContent = "0:00";
  totalEl.textContent = formatTime(durations[track.id]);
  if (seekInput) {
    seekInput.value = "0";
    seekInput.max = String(durations[track.id] || 0);
    seekInput.style.setProperty("--seek-pct", "0%");
  }
  player.pause();
  player.src = track.src;
  player.load();
  renderSequence();
  updatePlayButton(false);
  if (autoplay) startPlayback(requestId);
}

function updatePlayButton(rerender = true) {
  const playing = !player.paused && !player.ended && !!player.src;
  playBtn.textContent = playing ? "Pause" : "Play";
  playBtn.classList.toggle("is-playing", playing);
  playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  if (rerender) renderSequence();
}

function revertSequence() {
  sequence = [...DEFAULT_SEQUENCE];
  index = 0;
  saveSequence();
  renderSequence();
  selectTrack(0, false);
  metaEl.textContent = "Reverted";
}

playBtn.addEventListener("click", () => {
  stopFade();
  setVolume(targetVolume, { syncUi: true });
  if (!player.src) selectTrack(index, false);
  if (player.paused) {
    player.play().catch(() => {
      metaEl.textContent = "Could not play";
    });
  } else {
    player.pause();
  }
});

prevBtn.addEventListener("click", () => selectTrack(index - 1, true));
nextBtn.addEventListener("click", () => selectTrack(index + 1, true));
fadeInBtn.addEventListener("click", () => {
  fadeIn();
});
fadeOutBtn.addEventListener("click", () => {
  fadeOut();
});
revertBtn.addEventListener("click", revertSequence);

volumeInput?.addEventListener("input", () => {
  stopFade();
  targetVolume = Math.max(0, Math.min(1, Number(volumeInput.value) / 100));
  setVolume(targetVolume, { syncUi: true });
  saveVolume();
});

player.addEventListener("play", () => {
  metaEl.textContent = "Playing";
  updatePlayButton();
});

player.addEventListener("pause", () => {
  if (!player.ended && player.currentTime > 0) metaEl.textContent = "Paused";
  updatePlayButton();
});

player.addEventListener("ended", () => {
  metaEl.textContent = "Done";
  syncSeekUi(trackDuration());
  updatePlayButton();
});

player.addEventListener("loadedmetadata", () => {
  const track = currentTrack();
  if (track && Number.isFinite(player.duration) && player.duration > 0) {
    durations[track.id] = player.duration;
    updateDurationDisplays(track.id);
  }
  syncSeekUi(player.currentTime || 0);
  if (metaEl.textContent === "Loading…") metaEl.textContent = "Ready";
});

player.addEventListener("durationchange", () => {
  if (Number.isFinite(player.duration) && player.duration > 0) {
    const track = currentTrack();
    if (track) {
      durations[track.id] = player.duration;
      updateDurationDisplays(track.id);
    }
    syncSeekUi(player.currentTime || 0);
  }
});

player.addEventListener("timeupdate", () => {
  if (!seeking) syncSeekUi(player.currentTime || 0);
});

player.addEventListener("error", () => {
  metaEl.textContent = "Load error";
  updatePlayButton();
});

seekInput?.addEventListener("pointerdown", () => {
  seeking = true;
});

seekInput?.addEventListener("pointerup", () => {
  seeking = false;
  seekTo(Number(seekInput.value) || 0);
});

seekInput?.addEventListener("pointercancel", () => {
  seeking = false;
});

seekInput?.addEventListener("input", () => {
  seeking = true;
  const value = Number(seekInput.value) || 0;
  const dur = trackDuration();
  const pct = dur ? Math.max(0, Math.min(100, (value / dur) * 100)) : 0;
  seekInput.style.setProperty("--seek-pct", `${pct}%`);
  elapsedEl.textContent = formatTime(value);
});

seekInput?.addEventListener("change", () => {
  seeking = false;
  seekTo(Number(seekInput.value) || 0);
});

syncVolumeUi(targetVolume);
setVolume(targetVolume);
preloadDurations();
renderSequence();
selectTrack(0, false);
