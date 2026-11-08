const TRACKS = Array.from({ length: 14 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return {
    id: `track-${n}`,
    label: `Track ${i + 1}`,
    short: String(i + 1),
    src: `tracks/Track${n}.mp3`,
  };
});

const player = document.getElementById("player");
const tabsEl = document.getElementById("cue-tabs");
const titleEl = document.getElementById("now-title");
const metaEl = document.getElementById("now-meta");
const fillEl = document.getElementById("progress-fill");
const elapsedEl = document.getElementById("time-elapsed");
const totalEl = document.getElementById("time-total");
const playBtn = document.getElementById("btn-play");
const prevBtn = document.getElementById("btn-prev");
const nextBtn = document.getElementById("btn-next");
const stopBtn = document.getElementById("btn-stop");

let index = 0;
let seeking = false;

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function renderTabs() {
  tabsEl.innerHTML = "";
  TRACKS.forEach((track, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cue-tab";
    btn.role = "tab";
    btn.id = track.id;
    btn.setAttribute("aria-selected", i === index ? "true" : "false");
    btn.innerHTML = `<span>${track.short}</span><small>Cue</small>`;
    btn.addEventListener("click", () => selectTrack(i, true));
    tabsEl.appendChild(btn);
  });
}

function syncTabState() {
  [...tabsEl.children].forEach((btn, i) => {
    btn.setAttribute("aria-selected", i === index ? "true" : "false");
    btn.classList.toggle("is-playing", i === index && !player.paused && !player.ended);
  });
}

function selectTrack(i, autoplay) {
  index = Math.max(0, Math.min(TRACKS.length - 1, i));
  const track = TRACKS[index];
  titleEl.textContent = track.label;
  metaEl.textContent = autoplay ? "Loading…" : "Selected";
  fillEl.style.width = "0%";
  elapsedEl.textContent = "0:00";
  totalEl.textContent = "0:00";
  player.src = track.src;
  player.load();
  syncTabState();
  updatePlayButton();
  if (autoplay) {
    player.play().catch(() => {
      metaEl.textContent = "Tap Play to start";
    });
  }
}

function updatePlayButton() {
  const playing = !player.paused && !player.ended;
  playBtn.textContent = playing ? "Pause" : "Play";
  playBtn.classList.toggle("is-playing", playing);
  playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  syncTabState();
}

function stopPlayback() {
  player.pause();
  player.currentTime = 0;
  fillEl.style.width = "0%";
  elapsedEl.textContent = "0:00";
  metaEl.textContent = "Stopped";
  updatePlayButton();
}

playBtn.addEventListener("click", () => {
  if (!player.src) selectTrack(index, false);
  if (player.paused) {
    player.play().catch(() => {
      metaEl.textContent = "Could not play this cue";
    });
  } else {
    player.pause();
  }
});

prevBtn.addEventListener("click", () => selectTrack(index - 1, true));
nextBtn.addEventListener("click", () => selectTrack(index + 1, true));
stopBtn.addEventListener("click", stopPlayback);

player.addEventListener("play", () => {
  metaEl.textContent = "Playing";
  updatePlayButton();
});

player.addEventListener("pause", () => {
  if (!player.ended && player.currentTime > 0) metaEl.textContent = "Paused";
  updatePlayButton();
});

player.addEventListener("ended", () => {
  metaEl.textContent = "Finished";
  fillEl.style.width = "100%";
  updatePlayButton();
});

player.addEventListener("loadedmetadata", () => {
  totalEl.textContent = formatTime(player.duration);
  if (metaEl.textContent === "Loading…") metaEl.textContent = "Ready";
});

player.addEventListener("timeupdate", () => {
  if (seeking) return;
  const dur = player.duration || 0;
  const cur = player.currentTime || 0;
  fillEl.style.width = dur ? `${(cur / dur) * 100}%` : "0%";
  elapsedEl.textContent = formatTime(cur);
});

player.addEventListener("error", () => {
  metaEl.textContent = "Could not load this cue";
  updatePlayButton();
});

renderTabs();
selectTrack(0, false);
