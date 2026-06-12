# Pong

A clean, modern take on **Pong**. First to 11 points. The ball's bounce angle depends on *where* it hits your paddle, so you can aim shots by striking with the edge — and the rally speeds up the longer it lasts.

**▶ Play:** https://andreaisabelmontana.github.io/pong/

> **Not an original idea.** This recreates the concept of an existing project — I didn't invent it. I rebuilt it from scratch, my own way, out of curiosity about how it actually works (and tried to make it a little better along the way).

## Features

- **Paddle-spin physics** — contact point sets the deflection angle (±~68°)
- **Three CPU difficulties** — Casual / Standard / Brutal (capped reaction speed)
- **Rally acceleration** — the ball gains speed with every hit, up to a cap
- Mouse, keyboard (`↑ ↓` or `W S`), and touch controls
- Procedural **WebAudio** blips — no sound files
- Pause (`P`), mute (`M`), screen-shake juice on hits and scores

## Tech

Vanilla JavaScript + Canvas 2D, fixed 900×600 logical field scaled crisply to device resolution. No build step, no dependencies.

```
index.html
styles.css
src/game.js   # game loop, physics, CPU AI, audio, menus
```

## License

MIT — see [LICENSE](LICENSE).
