# Wings of Fury — Pacific Strike

A procedural Three.js carrier air-combat arcade game. This version is organised as a Vite project with ES modules instead of a single HTML file.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (normally **http://localhost:5173**).

## Production build

```bash
npm run build
npm run preview
```

`npm run dev` serves the source with hot reload. **`npm run build` creates the `dist/` folder** containing the production-ready HTML, CSS, JavaScript, and the Wilhelm scream audio asset. The built site is fully static, so it can be hosted anywhere.

Internet access is not required at runtime anymore: Three.js is installed from npm and bundled into `dist/`.

## Controls

| Input | Action |
|---|---|
| `W` / `S` or `↑` / `↓` | Pitch / climb and dive |
| **Mouse move up / down** | Pitch up / pitch down (relative aim) |
| `C` | Centre mouse pitch trim |
| Click the canvas | Capture the mouse with Pointer Lock for continuous aiming |
| `A` / `D` or `←` / `→` | Bank and reverse heading |
| `Shift` / `Ctrl` | Throttle up / down |
| `Space` / **Left mouse** | Fire the selected weapon |
| **Right mouse** | Quick-drop a bomb when bombs are not the selected weapon |
| `1` / `2` / `3` | Machine guns / bombs / rockets |
| `B` / `R` | Quick bomb / rocket |
| `Esc` or `P` | Pause |
| `M` | Mute |

Moving the mouse up raises the nose; moving it down lowers the nose. The trim is persistent, so small mouse movements can be used for precise gun-line corrections. Press `C` to re-centre it, or click the canvas to lock the pointer so you never run out of mouse mat.

## Source layout

```
index.html                    menu, HUD, overlays
src/main.js                   boot + dev-only game handle
src/styles.css                all UI styling
src/config.js                 tunable game constants
src/audio/AudioEngine.js      procedural audio + Wilhelm scream sample
src/core/utils.js             math, Perlin noise, DOM helpers
src/render/                   renderer, sky, ocean, clouds, textures
src/effects/                  particle system and tracer renderer
src/models/                   aircraft, carrier, ground units, geometry helpers
src/world/IslandWorld.js      procedural island chunk streaming
src/combat.js                 targets, weapons, projectiles, enemy fighters
src/ui/hud.js                 HUD element references and ranks
src/game/Game.js              game loop and aircraft/carrier state machine
src/assets/wilhelm_scream.ogg CC0 Wilhelm scream sound effect
```

## Assets and attribution

Everything except the Wilhelm scream is generated procedurally in code. The scream sample is the classic **Wilhelm scream** and lives at `src/assets/wilhelm_scream.ogg`. It plays when an infantry unit is killed on the ground. If you redistribute the game commercially, verify the sample's licensing for your jurisdiction; the [Wikimedia Commons recording](https://commons.wikimedia.org/wiki/File:Wilhelm_Scream.ogg) is available under a CC0 / public-domain dedication if you want a clearly licensed replacement.
