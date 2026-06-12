// Pong — a modern Pong.
// Fixed 900x600 logical field, rendered crisp at device resolution.
// Ball bounce angle depends on where it strikes the paddle, so players can
// "aim" by hitting with the paddle edge — and impart a little vertical spin.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const W = 900, H = 600;
const PADDLE_W = 14, PADDLE_H = 96, PADDLE_X = 28;
const WIN_SCORE = 11;

// crisp rendering on hi-dpi
function fit() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fit();
window.addEventListener("resize", fit);

const state = {
  running: false,
  paused: false,
  muted: false,
  cpuSpeed: 0.10,
  player: { y: H / 2 - PADDLE_H / 2, vy: 0 },
  cpu: { y: H / 2 - PADDLE_H / 2 },
  ball: null,
  score: { p: 0, c: 0 },
  shake: 0,
};

function newBall(dir) {
  const angle = (Math.random() * 0.6 - 0.3); // mostly horizontal serve
  const speed = 6;
  return {
    x: W / 2, y: H / 2,
    vx: Math.cos(angle) * speed * (dir || (Math.random() < 0.5 ? 1 : -1)),
    vy: Math.sin(angle) * speed,
    speed,
    r: 8,
  };
}

// ---- tiny WebAudio blips (no assets) ----
let actx = null;
function beep(freq, dur = 0.05, type = "square", gain = 0.04) {
  if (state.muted) return;
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
  if (e.key.toLowerCase() === "p" && state.running) state.paused = !state.paused;
  if (e.key.toLowerCase() === "m") state.muted = !state.muted;
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

// ---- update ----
function update() {
  const p = state.player, c = state.cpu, b = state.ball;

  // player movement: pointer takes priority, else keys
  if (pointerY != null) {
    p.y += (pointerY - PADDLE_H / 2 - p.y) * 0.35;
  } else {
    let dir = 0;
    if (keys.has("arrowup") || keys.has("w")) dir -= 1;
    if (keys.has("arrowdown") || keys.has("s")) dir += 1;
    p.y += dir * 9;
  }
  p.y = Math.max(0, Math.min(H - PADDLE_H, p.y));

  // CPU tracks the ball with a capped reaction speed (= difficulty)
  const target = b.y - PADDLE_H / 2;
  c.y += (target - c.y) * state.cpuSpeed;
  c.y = Math.max(0, Math.min(H - PADDLE_H, c.y));

  // ball motion
  b.x += b.vx; b.y += b.vy;

  // top / bottom walls
  if (b.y - b.r < 0) { b.y = b.r; b.vy *= -1; beep(220, 0.03); }
  if (b.y + b.r > H) { b.y = H - b.r; b.vy *= -1; beep(220, 0.03); }

  // paddle collisions
  // player (left)
  if (b.vx < 0 && b.x - b.r < PADDLE_X + PADDLE_W && b.x - b.r > PADDLE_X - 12 &&
      b.y > p.y && b.y < p.y + PADDLE_H) {
    deflect(b, p.y, 1);
  }
  // cpu (right)
  const cpuX = W - PADDLE_X - PADDLE_W;
  if (b.vx > 0 && b.x + b.r > cpuX && b.x + b.r < cpuX + PADDLE_W + 12 &&
      b.y > c.y && b.y < c.y + PADDLE_H) {
    deflect(b, c.y, -1);
  }

  // scoring
  if (b.x < -20) { state.score.c++; score(-1); }
  else if (b.x > W + 20) { state.score.p++; score(1); }

  if (state.shake > 0) state.shake *= 0.85;
}

function deflect(b, paddleY, dir) {
  const rel = (b.y - (paddleY + PADDLE_H / 2)) / (PADDLE_H / 2); // -1..1
  const maxAngle = Math.PI * 0.38;
  const angle = rel * maxAngle;
  b.speed = Math.min(15, b.speed + 0.45); // ball accelerates over a rally
  b.vx = Math.cos(angle) * b.speed * dir;
  b.vy = Math.sin(angle) * b.speed;
  state.shake = 6;
  beep(dir > 0 ? 420 : 360, 0.04);
}

function score(scorer) {
  beep(scorer > 0 ? 660 : 160, 0.18, "sawtooth", 0.05);
  state.shake = 14;
  if (state.score.p >= WIN_SCORE || state.score.c >= WIN_SCORE) return endGame();
  state.ball = newBall(scorer > 0 ? -1 : 1); // serve toward the loser
}

function endGame() {
  state.running = false;
  const win = state.score.p >= WIN_SCORE;
  document.getElementById("endtitle").textContent = win ? "YOU WIN" : "CPU WINS";
  document.getElementById("endtitle").style.color = win ? "var(--accent)" : "var(--accent2)";
  document.getElementById("endscreen").classList.remove("hidden");
}

// ---- render ----
function draw() {
  ctx.save();
  if (state.shake > 0.5) ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);

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
  ctx.fillText(state.score.p, W / 2 - 80, 78);
  ctx.fillText(state.score.c, W / 2 + 80, 78);

  // paddles
  ctx.fillStyle = "#4cff9e";
  roundRect(PADDLE_X, state.player.y, PADDLE_W, PADDLE_H, 6);
  ctx.fillStyle = "#ff5d7a";
  roundRect(W - PADDLE_X - PADDLE_W, state.cpu.y, PADDLE_W, PADDLE_H, 6);

  // ball
  const b = state.ball;
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
  if (state.running && !state.paused) update();
  draw();
  if (state.paused) {
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

document.getElementById("diffs").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  document.querySelectorAll("#diffs button").forEach((b) => b.classList.remove("sel"));
  btn.classList.add("sel");
  state.cpuSpeed = parseFloat(btn.dataset.diff);
});

function start() {
  state.score = { p: 0, c: 0 };
  state.player.y = state.cpu.y = H / 2 - PADDLE_H / 2;
  state.ball = newBall();
  state.running = true;
  state.paused = false;
  overlay.classList.add("hidden");
  endscreen.classList.add("hidden");
  beep(520, 0.08);
}
document.getElementById("play").addEventListener("click", start);
document.getElementById("again").addEventListener("click", start);

state.ball = newBall();
loop();
