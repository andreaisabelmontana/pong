// Pong — browser demo.
// All physics, AI, and scoring live in the framework-free core (pong.js).
// This file only handles canvas rendering, input, audio, and menus.

import { Game, FIELD, WIN_SCORE, DIFFICULTY } from "./pong.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const W = FIELD.W, H = FIELD.H;
const { PADDLE_W, PADDLE_H, PADDLE_X } = FIELD;

// crisp rendering on hi-dpi
function fit() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fit();
window.addEventListener("resize", fit);

let game = new Game({ difficulty: "standard" });

const ui = {
  running: false,
  paused: false,
  muted: false,
  difficulty: "standard",
  shake: 0,
};

// ---- tiny WebAudio blips (no assets) ----
let actx = null;
function beep(freq, dur = 0.05, type = "square", gain = 0.04) {
  if (ui.muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(actx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.stop(actx.currentTime + dur);
  } catch (e) { /* audio not available */ }
}

// ---- input ----
const keys = new Set();
window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === "p" && ui.running) ui.paused = !ui.paused;
  if (e.key.toLowerCase() === "m") ui.muted = !ui.muted;
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

let pointerY = null;
function pointer(e) {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  pointerY = ((t.clientY - rect.top) / rect.height) * H;
}
canvas.addEventListener("mousemove", pointer);
canvas.addEventListener("touchmove", (e) => { e.preventDefault(); pointer(e); }, { passive: false });

// ---- per-event juice / sound ----
function react(events) {
  for (const ev of events) {
    switch (ev) {
      case "wall": beep(220, 0.03); break;
      case "hitPlayer": ui.shake = 6; beep(420, 0.04); break;
      case "hitCpu": ui.shake = 6; beep(360, 0.04); break;
      case "scorePlayer": ui.shake = 14; beep(660, 0.18, "sawtooth", 0.05); break;
      case "scoreCpu": ui.shake = 14; beep(160, 0.18, "sawtooth", 0.05); break;
      case "gameOver": endGame(); break;
    }
  }
}

// ---- update ----
function update() {
  // player movement: pointer takes priority, else keys
  if (pointerY != null) {
    game.setPlayerTarget(pointerY);
  } else {
    let dir = 0;
    if (keys.has("arrowup") || keys.has("w")) dir -= 1;
    if (keys.has("arrowdown") || keys.has("s")) dir += 1;
    if (dir !== 0) game.setPlayerY(game.player.y + dir * 9);
  }

  react(game.step());

  if (ui.shake > 0) ui.shake *= 0.85;
}

// ---- render ----
function draw() {
  ctx.save();
  if (ui.shake > 0.5) ctx.translate((Math.random() - 0.5) * ui.shake, (Math.random() - 0.5) * ui.shake);

  ctx.fillStyle = "#090c14";
  ctx.fillRect(-20, -20, W + 40, H + 40);

  // center dashed line
  ctx.strokeStyle = "rgba(150,170,230,.18)";
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 18]);
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.setLineDash([]);

  // score
  ctx.fillStyle = "rgba(242,245,255,.85)";
  ctx.font = "700 64px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(game.score.player, W / 2 - 80, 78);
  ctx.fillText(game.score.cpu, W / 2 + 80, 78);

  // paddles
  ctx.fillStyle = "#4cff9e";
  roundRect(PADDLE_X, game.player.y, PADDLE_W, PADDLE_H, 6);
  ctx.fillStyle = "#ff5d7a";
  roundRect(W - PADDLE_X - PADDLE_W, game.cpu.y, PADDLE_W, PADDLE_H, 6);

  // ball
  const b = game.ball;
  ctx.fillStyle = "#f2f5ff";
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function loop() {
  if (ui.running && !ui.paused) update();
  draw();
  if (ui.paused) {
    ctx.fillStyle = "rgba(7,9,15,.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#f2f5ff";
    ctx.font = "700 40px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", W / 2, H / 2);
  }
  requestAnimationFrame(loop);
}

// ---- menu wiring ----
const overlay = document.getElementById("overlay");
const endscreen = document.getElementById("endscreen");

// map the existing data-diff numbers to named presets, closest reaction wins
const DIFF_BY_REACTION = Object.entries(DIFFICULTY)
  .sort((a, b) => a[1].reaction - b[1].reaction);
function nameForReaction(r) {
  let best = DIFF_BY_REACTION[0][0], bestD = Infinity;
  for (const [name, cfg] of DIFF_BY_REACTION) {
    const d = Math.abs(cfg.reaction - r);
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

document.getElementById("diffs").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  document.querySelectorAll("#diffs button").forEach((b) => b.classList.remove("sel"));
  btn.classList.add("sel");
  ui.difficulty = nameForReaction(parseFloat(btn.dataset.diff));
});

function endGame() {
  ui.running = false;
  const win = game.winner === "player";
  const title = document.getElementById("endtitle");
  title.textContent = win ? "YOU WIN" : "CPU WINS";
  title.style.color = win ? "var(--accent)" : "var(--accent2)";
  endscreen.classList.remove("hidden");
}

function start() {
  game = new Game({ difficulty: ui.difficulty });
  ui.running = true;
  ui.paused = false;
  overlay.classList.add("hidden");
  endscreen.classList.add("hidden");
  beep(520, 0.08);
}
document.getElementById("play").addEventListener("click", start);
document.getElementById("again").addEventListener("click", start);

loop();
