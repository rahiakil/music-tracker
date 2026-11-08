const LIBRARY = [
  { id: "1-OpeningTrack01", file: "1-OpeningTrack01.mp3", label: "OpeningTrack01" },
  { id: "2-Doorbell1", file: "2-Doorbell1.mp3", label: "Doorbell1" },
  { id: "3-Doorbell2", file: "3-Doorbell2.mp3", label: "Doorbell2" },
  { id: "4-Doorbellmulti", file: "4-Doorbellmulti.mp3", label: "Doorbellmulti" },
  { id: "5-Track02", file: "5-Track02.mp3", label: "Track02" },
  { id: "6-Track03", file: "6-Track03.mp3", label: "Track03" },
  { id: "7-Track04", file: "7-Track04.mp3", label: "Track04" },
  { id: "8-mixTrack05", file: "8-mixTrack05.mp3", label: "mixTrack05" },
  { id: "9-Track07", file: "9-Track07.mp3", label: "Track07" },
].map((t) => ({ ...t, src: `tracks/${t.file}` }));

const DEFAULT_SEQUENCE = LIBRARY.map((t) => t.id);
const STORAGE_KEY = "brishchik-sequence-v2";

const player = document.getElementById("player");
const libraryEl = document.getElementById("library");
const sequenceEl = document.getElementById("sequence");
const emptyEl = document.getElementById("sequence-empty");
const titleEl = document.getElementById("now-title");
const metaEl = document.getElementById("now-meta");
const fillEl = document.getElementById("progress-fill");
const elapsedEl = document.getElementById("time-elapsed");
const totalEl = document.getElementById("time-total");
const playBtn = document.getElementById("btn-play");
const prevBtn = document.getElementById("btn-prev");
const nextBtn = document.getElementById("btn-next");
const stopBtn = document.getElementById("btn-stop");
const revertBtn = document.getElementById("btn-revert");

const byId = Object.fromEntries(LIBRARY.map((t) => [t.id, t]));

let sequence = loadSequence();
let index = 0;
let dragPayload = null;

function loadSequence() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_SEQUENCE];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_SEQUENCE];
    return parsed.filter((id) => byId[id]);
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

    const cueLabel = isActive ? `<span class="link-badge">Cue ${index + 1}</span>` : "";
    btn.innerHTML = `
      <span class="music-btn-main">
        <span class="music-btn-name">${track.label}</span>
        <span class="music-btn-file">${track.file}</span>
      </span>
      ${cueLabel}
    `;
    btn.title = isActive
      ? `Cue ${index + 1} means this file`
      : "Drag into sequence, or click to add";

    btn.addEventListener("dragstart", (e) => onLibraryDragStart(e, track.id));
    btn.addEventListener("dragend", clearDragState);
    btn.addEventListener("click", () => addToSequence(track.id));
    libraryEl.appendChild(btn);
  });
}

function renderSequence() {
  sequenceEl.innerHTML = "";
  emptyEl.hidden = sequence.length > 0;

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
      <span class="cue-name">${track.label}</span>
    `;
    cueBtn.setAttribute("aria-label", `Cue ${i + 1}: ${track.label}`);
    cueBtn.addEventListener("click", () => selectTrack(i, true));

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "×";
    removeBtn.setAttribute("aria-label", `Remove cue ${i + 1}`);
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFromSequence(i);
    });

    li.append(cueBtn, removeBtn);
    li.addEventListener("dragstart", (e) => onSequenceDragStart(e, i));
    li.addEventListener("dragend", clearDragState);
    li.addEventListener("dragover", (e) => onSequenceDragOver(e, i));
    li.addEventListener("dragleave", () => li.classList.remove("drag-over"));
    li.addEventListener("drop", (e) => onSequenceDrop(e, i));
    sequenceEl.appendChild(li);
  });

  renderLibrary();
}

function onLibraryDragStart(e, trackId) {
  dragPayload = { type: "library", trackId };
  e.dataTransfer.effectAllowed = "copy";
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
  e.dataTransfer.dropEffect = dragPayload?.type === "sequence" ? "move" : "copy";
  [...sequenceEl.children].forEach((el, i) => {
    el.classList.toggle("drag-over", i === overIndex);
  });
}

function onSequenceDrop(e, toIndex) {
  e.preventDefault();
  const payload = dragPayload;
  clearDragState();
  dragPayload = null;
  if (!payload) {
    const id = e.dataTransfer.getData("text/plain");
    if (byId[id]) addToSequence(id, toIndex);
    return;
  }
  if (payload.type === "library") addToSequence(payload.trackId, toIndex);
  else if (payload.type === "sequence") moveInSequence(payload.fromIndex, toIndex);
}

function clearDragState() {
  sequenceEl.classList.remove("is-drop-target");
  [...sequenceEl.children].forEach((el) => el.classList.remove("drag-over"));
}

sequenceEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  sequenceEl.classList.add("is-drop-target");
});

sequenceEl.addEventListener("dragleave", (e) => {
  if (!sequenceEl.contains(e.relatedTarget)) sequenceEl.classList.remove("is-drop-target");
});

sequenceEl.addEventListener("drop", (e) => {
  if (e.target !== sequenceEl && sequenceEl.contains(e.target)) return;
  e.preventDefault();
  const payload = dragPayload;
  clearDragState();
  dragPayload = null;
  if (payload?.type === "library") addToSequence(payload.trackId);
  else {
    const id = e.dataTransfer.getData("text/plain");
    if (byId[id]) addToSequence(id);
  }
});

function addToSequence(trackId, atIndex = sequence.length) {
  if (!byId[trackId]) return;
  const insertAt = Math.max(0, Math.min(sequence.length, atIndex));
  sequence.splice(insertAt, 0, trackId);
  saveSequence();
  if (insertAt <= index && sequence.length > 1) index += 1;
  renderSequence();
  if (sequence.length === 1) selectTrack(0, false);
  else syncNowLabel();
}

function moveInSequence(fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const [item] = sequence.splice(fromIndex, 1);
  sequence.splice(toIndex, 0, item);
  if (index === fromIndex) index = toIndex;
  else if (fromIndex < index && toIndex >= index) index -= 1;
  else if (fromIndex > index && toIndex <= index) index += 1;
  saveSequence();
  renderSequence();
  syncNowLabel();
}

function removeFromSequence(i) {
  sequence.splice(i, 1);
  if (index >= sequence.length) index = Math.max(0, sequence.length - 1);
  else if (i < index) index -= 1;
  saveSequence();
  renderSequence();
  if (sequence.length) selectTrack(index, false);
  else {
    titleEl.textContent = "—";
    metaEl.textContent = "Empty";
    player.removeAttribute("src");
    fillEl.style.width = "0%";
    updatePlayButton(false);
  }
}

function syncNowLabel() {
  if (!sequence.length) {
    titleEl.textContent = "—";
    return;
  }
  titleEl.textContent = String(index + 1);
}

function selectTrack(i, autoplay) {
  if (!sequence.length) return;
  index = Math.max(0, Math.min(sequence.length - 1, i));
  const track = currentTrack();
  if (!track) return;
  syncNowLabel();
  metaEl.textContent = autoplay ? "Loading…" : "Selected";
  fillEl.style.width = "0%";
  elapsedEl.textContent = "0:00";
  totalEl.textContent = "0:00";
  player.src = track.src;
  player.load();
  renderSequence();
  updatePlayButton(false);
  if (autoplay) {
    player.play().catch(() => {
      metaEl.textContent = "Tap Play";
    });
  }
}

function updatePlayButton(rerender = true) {
  const playing = !player.paused && !player.ended && !!player.src;
  playBtn.textContent = playing ? "Pause" : "Play";
  playBtn.classList.toggle("is-playing", playing);
  playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  if (rerender) renderSequence();
}

function stopPlayback() {
  player.pause();
  player.currentTime = 0;
  fillEl.style.width = "0%";
  elapsedEl.textContent = "0:00";
  metaEl.textContent = "Stopped";
  updatePlayButton();
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
  if (!sequence.length) {
    metaEl.textContent = "Add music first";
    return;
  }
  if (!player.src) selectTrack(index, false);
  if (player.paused) {
    player.play().catch(() => {
      metaEl.textContent = "Could not play";
    });
  } else {
    player.pause();
  }
});

prevBtn.addEventListener("click", () => {
  if (!sequence.length) return;
  selectTrack(index - 1, true);
});

nextBtn.addEventListener("click", () => {
  if (!sequence.length) return;
  selectTrack(index + 1, true);
});

stopBtn.addEventListener("click", stopPlayback);
revertBtn.addEventListener("click", revertSequence);

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
  fillEl.style.width = "100%";
  updatePlayButton();
});

player.addEventListener("loadedmetadata", () => {
  totalEl.textContent = formatTime(player.duration);
  if (metaEl.textContent === "Loading…") metaEl.textContent = "Ready";
});

player.addEventListener("timeupdate", () => {
  const dur = player.duration || 0;
  const cur = player.currentTime || 0;
  fillEl.style.width = dur ? `${(cur / dur) * 100}%` : "0%";
  elapsedEl.textContent = formatTime(cur);
});

player.addEventListener("error", () => {
  metaEl.textContent = "Load error";
  updatePlayButton();
});

renderSequence();
if (sequence.length) selectTrack(0, false);
else {
  titleEl.textContent = "—";
  metaEl.textContent = "Empty";
  renderLibrary();
}
