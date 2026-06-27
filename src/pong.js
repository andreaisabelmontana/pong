// Pong core — framework-free game logic. No canvas, no DOM, no audio.
//
// Everything here is pure data + math so it can be unit-tested in Node and
// reused by any renderer. The browser demo (game.js) drives this module and
// only handles drawing, input, and sound.
//
// Coordinate system: a fixed logical field, origin at top-left, y grows down.
// The left paddle is the player; the right paddle is the CPU.

export const FIELD = Object.freeze({
  W: 900,
  H: 600,
  PADDLE_W: 14,
  PADDLE_H: 96,
  PADDLE_X: 28, // gap from each side wall to the paddle's outer edge
});

export const WIN_SCORE = 11;

// Ball tuning.
const BALL_R = 8;
const SERVE_SPEED = 6;
const MAX_SPEED = 15;
const SPEEDUP = 0.45; // speed added on every paddle hit (rally acceleration)
const MAX_DEFLECT = Math.PI * 0.38; // ~68° — angle at the very edge of a paddle

// CPU difficulty presets: reaction = fraction of the gap closed per step,
// jitter = random aim error (px) added to the target each step. Higher
// reaction + lower jitter = harder.
export const DIFFICULTY = Object.freeze({
  casual: { reaction: 0.06, jitter: 34 },
  standard: { reaction: 0.1, jitter: 16 },
  brutal: { reaction: 0.16, jitter: 4 },
});

// Deterministic RNG so tests are reproducible; defaults to Math.random.
function defaultRng() {
  return Math.random();
}

// ---- ball ----

// Create a freshly-served ball at center. `dir` is +1 (toward CPU) or -1
// (toward player); omit to pick randomly. The serve is mostly horizontal with
// a small random vertical component.
export function newBall(dir, rng = defaultRng) {
  const angle = rng() * 0.6 - 0.3; // -0.3..0.3 rad
  const d = dir || (rng() < 0.5 ? 1 : -1);
  return {
    x: FIELD.W / 2,
    y: FIELD.H / 2,
    vx: Math.cos(angle) * SERVE_SPEED * d,
    vy: Math.sin(angle) * SERVE_SPEED,
    speed: SERVE_SPEED,
    r: BALL_R,
  };
}

// ---- physics primitives (pure, return event info) ----

// Bounce the ball off the top/bottom walls if it has crossed them. Flips
// vertical velocity, preserves horizontal velocity, and clamps the ball back
// inside the field. Returns true if a bounce happened.
export function bounceWalls(ball, H = FIELD.H) {
  let bounced = false;
  if (ball.y - ball.r < 0) {
    ball.y = ball.r;
    ball.vy = -ball.vy;
    bounced = true;
  } else if (ball.y + ball.r > H) {
    ball.y = H - ball.r;
    ball.vy = -ball.vy;
    bounced = true;
  }
  return bounced;
}

// Reflect the ball off a paddle. The deflection angle is set by WHERE the ball
// struck relative to the paddle center (`rel` in -1..1): center -> straight,
// edges -> steep angle. `dir` is the post-bounce horizontal direction
// (+1 for the player paddle sending it right, -1 for the CPU paddle).
// Mutates and returns the ball. Speed grows each hit up to MAX_SPEED.
export function deflect(ball, paddleY, dir, paddleH = FIELD.PADDLE_H) {
  const rel = clamp((ball.y - (paddleY + paddleH / 2)) / (paddleH / 2), -1, 1);
  const angle = rel * MAX_DEFLECT;
  ball.speed = Math.min(MAX_SPEED, ball.speed + SPEEDUP);
  ball.vx = Math.cos(angle) * ball.speed * dir;
  ball.vy = Math.sin(angle) * ball.speed;
  return ball;
}

// Test whether a ball is overlapping a paddle on the relevant side, accounting
// for travel direction. `side` is "left" (player) or "right" (cpu). Uses a
// small tolerance band so a fast ball can't slip past in one step (anti-tunnel).
export function paddleHit(ball, paddleY, side, field = FIELD) {
  const { PADDLE_W, PADDLE_H, PADDLE_X, W } = field;
  const withinY = ball.y > paddleY && ball.y < paddleY + PADDLE_H;
  if (!withinY) return false;
  if (side === "left") {
    const front = PADDLE_X + PADDLE_W; // inner face of player's paddle
    return ball.vx < 0 && ball.x - ball.r < front && ball.x - ball.r > PADDLE_X - 12;
  } else {
    const front = W - PADDLE_X - PADDLE_W; // inner face of cpu's paddle
    return ball.vx > 0 && ball.x + ball.r > front && ball.x + ball.r < front + PADDLE_W + 12;
  }
}

// ---- CPU AI ----

// Move the CPU paddle one step toward the ball. It eases toward the ball's y
// (minus half a paddle so the paddle centers on the ball) at `reaction` speed,
// with `jitter` px of random aim error. Returns the new y (clamped on-field).
export function cpuStep(cpuY, ball, difficulty, rng = defaultRng, field = FIELD) {
  const { reaction, jitter } = resolveDifficulty(difficulty);
  const error = (rng() * 2 - 1) * jitter;
  const target = ball.y - field.PADDLE_H / 2 + error;
  let y = cpuY + (target - cpuY) * reaction;
  return clamp(y, 0, field.H - field.PADDLE_H);
}

function resolveDifficulty(difficulty) {
  if (typeof difficulty === "string") return DIFFICULTY[difficulty] ?? DIFFICULTY.standard;
  if (difficulty && typeof difficulty === "object") return difficulty;
  return DIFFICULTY.standard;
}

// ---- game orchestration ----

// A self-contained match. Holds paddles, ball, score, and difficulty, and
// advances the simulation one fixed step at a time. The renderer reads state;
// inputs come in through `setPlayerY` / `setPlayerTarget`.
export class Game {
  constructor({ difficulty = "standard", rng = defaultRng } = {}) {
    this.rng = rng;
    this.difficulty = difficulty;
    this.field = FIELD;
    this.winScore = WIN_SCORE;
    this.reset();
  }

  reset() {
    const { H, PADDLE_H } = this.field;
    this.player = { y: H / 2 - PADDLE_H / 2 };
    this.cpu = { y: H / 2 - PADDLE_H / 2 };
    this.score = { player: 0, cpu: 0 };
    this.over = false;
    this.winner = null;
    this.ball = newBall(undefined, this.rng);
  }

  // Set the player paddle directly (e.g. from keyboard), clamped on-field.
  setPlayerY(y) {
    this.player.y = clamp(y, 0, this.field.H - this.field.PADDLE_H);
  }

  // Ease the player paddle toward a target y (e.g. from the mouse pointer).
  setPlayerTarget(pointerY, ease = 0.35) {
    const target = pointerY - this.field.PADDLE_H / 2;
    this.setPlayerY(this.player.y + (target - this.player.y) * ease);
  }

  // Advance the simulation by one step. Returns a list of event names that
  // occurred this step: "wall", "hitPlayer", "hitCpu", "scorePlayer",
  // "scoreCpu", "gameOver" — handy for the renderer to trigger sound/juice.
  step() {
    if (this.over) return [];
    const events = [];
    const b = this.ball;
    const { W } = this.field;

    // CPU AI
    this.cpu.y = cpuStep(this.cpu.y, b, this.difficulty, this.rng, this.field);

    // integrate
    b.x += b.vx;
    b.y += b.vy;

    // walls
    if (bounceWalls(b, this.field.H)) events.push("wall");

    // paddles
    if (paddleHit(b, this.player.y, "left", this.field)) {
      // snap the ball to the paddle face so it can't tunnel through
      b.x = this.field.PADDLE_X + this.field.PADDLE_W + b.r;
      deflect(b, this.player.y, +1, this.field.PADDLE_H);
      events.push("hitPlayer");
    } else if (paddleHit(b, this.cpu.y, "right", this.field)) {
      b.x = W - this.field.PADDLE_X - this.field.PADDLE_W - b.r;
      deflect(b, this.cpu.y, -1, this.field.PADDLE_H);
      events.push("hitCpu");
    }

    // scoring — a point is awarded when the ball leaves a side
    if (b.x < -20) {
      this.score.cpu++;
      events.push("scoreCpu");
      if (!this._checkWin(events)) this.ball = newBall(1, this.rng); // serve to player
    } else if (b.x > W + 20) {
      this.score.player++;
      events.push("scorePlayer");
      if (!this._checkWin(events)) this.ball = newBall(-1, this.rng); // serve to cpu
    }

    return events;
  }

  _checkWin(events) {
    if (this.score.player >= this.winScore || this.score.cpu >= this.winScore) {
      this.over = true;
      this.winner = this.score.player >= this.winScore ? "player" : "cpu";
      events.push("gameOver");
      return true;
    }
    return false;
  }
}

// ---- helpers ----
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
