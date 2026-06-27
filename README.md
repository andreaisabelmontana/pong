# Pong

A clean, modern Pong — paddle-spin physics, three CPU difficulties, first to 11.

**▶ Play:** https://andreaisabelmontana.github.io/pong/

> **Not an original idea.** This recreates the concept of an existing project — I didn't invent it. I rebuilt it from scratch, my own way, out of curiosity about how it actually works (and tried to make it a little better along the way).

The game logic lives in a framework-free ES module (`src/pong.js`) with no canvas, DOM, or audio, so it can be unit-tested in Node. The browser demo (`src/game.js`) drives that core and only handles rendering, input, and sound.

## How it plays

Logical field is a fixed **900×600**, origin top-left, y growing down. Left paddle is you, right paddle is the CPU. First to **11** wins.

## Collision + spin model

**Walls (top/bottom).** When the ball crosses an edge it is clamped back inside and its vertical velocity flips; horizontal velocity is untouched (`bounceWalls`).

**Paddles.** Deflection angle is set by *where* the ball strikes the paddle, not by its incoming angle. Let `rel ∈ [-1, 1]` be the contact point relative to the paddle center (0 = dead center, ±1 = the very edges):

```
angle  = rel * (0.38π)          // up to ~68° at the edge
speed  = min(15, speed + 0.45)  // rally acceleration, capped
vx     = cos(angle) * speed * dir
vy     = sin(angle) * speed
```

So a center hit comes off nearly straight, and an edge hit imparts steep spin — you "aim" by striking with the paddle's edge. Speed grows every hit but is hard-capped at 15, and on contact the ball is snapped to the paddle face so a fast ball can't tunnel through (`deflect`, `paddleHit`).

## CPU AI

Each step the CPU eases toward the ball's y by a fraction of the remaining gap (`reaction`) plus some random aim error (`jitter`). Higher reaction and lower jitter = harder:

| Difficulty | reaction | jitter |
|------------|----------|--------|
| Casual     | 0.06     | 34 px  |
| Standard   | 0.10     | 16 px  |
| Brutal     | 0.16     | 4 px   |

(`cpuStep` / `DIFFICULTY`.)

## Scoring

A point is scored when the ball leaves a side. The scorer's count increments, and the ball resets to center and serves toward the player who was just scored on. At 11 the game ends and reports the winner (`Game.step`).

## Run it

**Demo** — it's a single self-contained static site, no build step:

```
# any static server, e.g.
python -m http.server
# then open http://localhost:8000
```

Or just open `index.html`.

**Tests** — pure Node, no dependencies (Node 24's built-in runner):

```
node --test
```

```
✔ wall bounce flips vertical velocity and preserves horizontal
✔ center hit reflects roughly straight; edge hit imparts spin
✔ speed grows on a hit but stays bounded by the cap
✔ CPU paddle moves toward the ball's y
✔ harder difficulty tracks more aggressively than an easier one
✔ scoring increments and the ball resets after a point
✔ game ends exactly at the win score
✔ paddleHit detects overlap on the correct side and direction
✔ ball never tunnels through the player paddle on a normal step
✔ a full simulated rally stays bounded and eventually ends
ℹ tests 10
ℹ pass 10
ℹ fail 0
```

## Controls

Move: **mouse** / **↑ ↓** / **W S** · Pause: **P** · Mute: **M**

## Layout

```
index.html
styles.css
src/pong.js   # framework-free core: physics, CPU AI, scoring/win logic
src/game.js   # browser demo: canvas render, input, WebAudio, menus
test/pong.test.js
package.json
```

## License

MIT — see [LICENSE](LICENSE).
