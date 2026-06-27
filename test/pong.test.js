import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Game,
  FIELD,
  WIN_SCORE,
  DIFFICULTY,
  newBall,
  bounceWalls,
  deflect,
  paddleHit,
  cpuStep,
} from "../src/pong.js";

// A fixed RNG so "random" serves and CPU jitter are deterministic in tests.
function fixedRng(value = 0.5) {
  return () => value;
}

// A small seeded PRNG (mulberry32) for tests that need varied-but-reproducible
// randomness — e.g. a full rally where the CPU must occasionally miss.
function seededRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("wall bounce flips vertical velocity and preserves horizontal", () => {
  // ball already past the top wall, moving up and to the right
  const ball = { x: 100, y: 2, vx: 5, vy: -7, r: 8, speed: 7 };
  const bounced = bounceWalls(ball, FIELD.H);
  assert.equal(bounced, true);
  assert.equal(ball.vy, 7, "vertical velocity should flip sign");
  assert.equal(ball.vx, 5, "horizontal velocity should be unchanged");
  assert.equal(ball.y, ball.r, "ball is clamped back inside the top edge");

  // bottom wall
  const ball2 = { x: 100, y: FIELD.H - 1, vx: -4, vy: 9, r: 8, speed: 9 };
  assert.equal(bounceWalls(ball2, FIELD.H), true);
  assert.equal(ball2.vy, -9);
  assert.equal(ball2.vx, -4);
  assert.equal(ball2.y, FIELD.H - ball2.r);

  // no bounce when in the clear
  const ball3 = { x: 100, y: 300, vx: 3, vy: 2, r: 8, speed: 4 };
  assert.equal(bounceWalls(ball3, FIELD.H), false);
  assert.equal(ball3.vy, 2);
});

test("center hit reflects roughly straight; edge hit imparts spin", () => {
  const paddleY = 200; // paddle spans 200..296, center at 248
  const center = paddleY + FIELD.PADDLE_H / 2;

  // dead-center hit -> nearly horizontal, tiny |vy|
  const ballC = { x: 50, y: center, vx: -6, vy: 0, r: 8, speed: 6 };
  deflect(ballC, paddleY, +1);
  assert.ok(ballC.vx > 0, "ball should now travel to the right");
  assert.ok(Math.abs(ballC.vy) < 0.5, `center hit should be near-straight, got vy=${ballC.vy}`);

  // near-edge hit -> steep angle, large |vy|
  const edgeY = paddleY + FIELD.PADDLE_H - 1; // bottom edge of paddle
  const ballE = { x: 50, y: edgeY, vx: -6, vy: 0, r: 8, speed: 6 };
  deflect(ballE, paddleY, +1);
  assert.ok(ballE.vx > 0, "ball should travel right after edge hit too");
  assert.ok(
    Math.abs(ballE.vy) > Math.abs(ballC.vy) + 3,
    `edge hit should impart more spin than center: edge|vy|=${Math.abs(ballE.vy)} center|vy|=${Math.abs(ballC.vy)}`
  );

  // symmetry: top edge spins the opposite direction
  const topEdgeY = paddleY + 1;
  const ballT = { x: 50, y: topEdgeY, vx: -6, vy: 0, r: 8, speed: 6 };
  deflect(ballT, paddleY, +1);
  assert.ok(ballT.vy < 0, "hitting above center should send the ball upward");
  assert.ok(ballE.vy > 0, "hitting below center should send the ball downward");
});

test("speed grows on a hit but stays bounded by the cap", () => {
  const paddleY = 200;
  const ball = { x: 50, y: paddleY + FIELD.PADDLE_H / 2, vx: -6, vy: 0, r: 8, speed: 6 };
  deflect(ball, paddleY, +1);
  assert.ok(ball.speed > 6, "speed should increase after a hit");

  // hammer it many times; speed must never exceed the cap
  for (let i = 0; i < 100; i++) deflect(ball, paddleY, +1);
  assert.ok(ball.speed <= 15, `speed cap should hold, got ${ball.speed}`);
  const mag = Math.hypot(ball.vx, ball.vy);
  assert.ok(mag <= 15 + 1e-9, `velocity magnitude should stay <= cap, got ${mag}`);
});

test("CPU paddle moves toward the ball's y", () => {
  const ball = { x: 450, y: 500, r: 8 }; // ball low on the field
  const startY = 0; // paddle at the very top
  const after = cpuStep(startY, ball, "brutal", fixedRng(0.5)); // jitter cancels at 0.5
  assert.ok(after > startY, "CPU should move down toward a low ball");
  assert.ok(after <= FIELD.H - FIELD.PADDLE_H, "CPU stays on-field");

  // and upward toward a high ball
  const highBall = { x: 450, y: 50, r: 8 };
  const startLow = FIELD.H - FIELD.PADDLE_H;
  const afterUp = cpuStep(startLow, highBall, "brutal", fixedRng(0.5));
  assert.ok(afterUp < startLow, "CPU should move up toward a high ball");
});

test("harder difficulty tracks more aggressively than an easier one", () => {
  const ball = { x: 450, y: 560, r: 8 };
  const startY = 0;
  const rng = fixedRng(0.5); // neutral jitter so we compare pure reaction

  const casual = cpuStep(startY, ball, "casual", rng);
  const standard = cpuStep(startY, ball, "standard", rng);
  const brutal = cpuStep(startY, ball, "brutal", rng);

  assert.ok(brutal > standard, "brutal closes more of the gap than standard");
  assert.ok(standard > casual, "standard closes more of the gap than casual");

  // brutal also has less aim error than casual
  assert.ok(DIFFICULTY.brutal.jitter < DIFFICULTY.casual.jitter);
  assert.ok(DIFFICULTY.brutal.reaction > DIFFICULTY.casual.reaction);

  // worst-case jitter spread is larger on the easier setting
  const casualSpread = Math.abs(
    cpuStep(startY, ball, "casual", fixedRng(1)) - cpuStep(startY, ball, "casual", fixedRng(0))
  );
  const brutalSpread = Math.abs(
    cpuStep(startY, ball, "brutal", fixedRng(1)) - cpuStep(startY, ball, "brutal", fixedRng(0))
  );
  assert.ok(casualSpread > brutalSpread, "easier CPU is noisier (more error spread)");
});

test("scoring increments and the ball resets after a point", () => {
  const g = new Game({ difficulty: "standard", rng: fixedRng(0.5) });
  // shove the ball off the right edge so the player scores
  g.ball.x = FIELD.W + 100;
  g.ball.vx = 12;
  const events = g.step();
  assert.ok(events.includes("scorePlayer"), "player should score");
  assert.equal(g.score.player, 1);
  assert.equal(g.score.cpu, 0);
  // ball reset to center
  assert.equal(g.ball.x, FIELD.W / 2);
  assert.equal(g.ball.y, FIELD.H / 2);

  // off the left edge -> CPU scores
  g.ball.x = -100;
  g.ball.vx = -12;
  const events2 = g.step();
  assert.ok(events2.includes("scoreCpu"), "CPU should score");
  assert.equal(g.score.cpu, 1);
  assert.equal(g.ball.x, FIELD.W / 2);
});

test("game ends exactly at the win score", () => {
  const g = new Game({ difficulty: "standard", rng: fixedRng(0.5) });
  // drive 10 player points
  for (let i = 0; i < WIN_SCORE - 1; i++) {
    g.ball.x = FIELD.W + 100;
    g.ball.vx = 12;
    g.step();
    assert.equal(g.over, false, `should not be over at ${g.score.player} points`);
  }
  assert.equal(g.score.player, WIN_SCORE - 1);

  // the 11th point ends it
  g.ball.x = FIELD.W + 100;
  g.ball.vx = 12;
  const events = g.step();
  assert.ok(events.includes("gameOver"), "gameOver event should fire");
  assert.equal(g.score.player, WIN_SCORE);
  assert.equal(g.over, true);
  assert.equal(g.winner, "player");

  // a finished game does not advance further
  const noop = g.step();
  assert.deepEqual(noop, []);
  assert.equal(g.score.player, WIN_SCORE);
});

test("paddleHit detects overlap on the correct side and direction", () => {
  // player paddle on the left at y=250
  const py = 250;
  const onFace = { x: FIELD.PADDLE_X + FIELD.PADDLE_W + 4, y: py + 10, vx: -6, r: 8 };
  assert.equal(paddleHit(onFace, py, "left"), true);
  // same spot but moving away -> no hit
  const movingAway = { ...onFace, vx: +6 };
  assert.equal(paddleHit(movingAway, py, "left"), false);
  // outside the paddle's vertical span -> no hit
  const abovePaddle = { x: onFace.x, y: py - 50, vx: -6, r: 8 };
  assert.equal(paddleHit(abovePaddle, py, "left"), false);

  // cpu paddle on the right
  const cy = 250;
  const cpuFaceX = FIELD.W - FIELD.PADDLE_X - FIELD.PADDLE_W;
  const onCpu = { x: cpuFaceX + 2, y: cy + 10, vx: +6, r: 8 };
  assert.equal(paddleHit(onCpu, cy, "right"), true);
});

test("ball never tunnels through the player paddle on a normal step", () => {
  // Use a deterministic game and force a fast ball heading at the player paddle.
  const g = new Game({ difficulty: "standard", rng: fixedRng(0.5) });
  // Park the player paddle to cover the ball's path, and aim a max-speed ball
  // straight at its face from just outside.
  const paddleY = 252; // center ~300
  g.setPlayerY(paddleY);
  g.ball = {
    x: FIELD.PADDLE_X + FIELD.PADDLE_W + 10,
    y: 300,
    vx: -15, // max speed, straight at the paddle
    vy: 0,
    r: 8,
    speed: 15,
  };
  const events = g.step();
  assert.ok(events.includes("hitPlayer"), "fast ball should be caught by the paddle, not tunnel through");
  assert.ok(g.ball.vx > 0, "ball should bounce back to the right");
  assert.ok(g.ball.x >= FIELD.PADDLE_X + FIELD.PADDLE_W, "ball is snapped to the paddle face, never behind it");
  assert.equal(g.score.cpu, 0, "no point conceded");
});

test("a full simulated rally stays bounded and eventually ends", () => {
  // Player paddle perfectly tracks the ball; the CPU uses seeded jitter so it
  // sometimes misses and the match resolves. Play until someone reaches 11.
  const g = new Game({ difficulty: "casual", rng: seededRng(7) });
  let maxSpeed = 0;
  let steps = 0;
  while (!g.over && steps < 200000) {
    // simple perfect tracker for the player
    g.setPlayerY(g.ball.y - FIELD.PADDLE_H / 2);
    g.step();
    maxSpeed = Math.max(maxSpeed, Math.hypot(g.ball.vx, g.ball.vy));
    // ball must always be within a sane band (allowing the off-field scoring margin)
    assert.ok(g.ball.x > -25 && g.ball.x < FIELD.W + 25, `ball x out of bounds: ${g.ball.x}`);
    assert.ok(g.ball.y >= 0 && g.ball.y <= FIELD.H, `ball y out of bounds: ${g.ball.y}`);
    steps++;
  }
  assert.equal(g.over, true, "match should finish within the step budget");
  assert.ok(maxSpeed <= 15 + 1e-9, `speed must stay bounded, peak was ${maxSpeed}`);
});
