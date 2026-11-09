# AVORA — Hero

Premium fintech hero: a champagne card floating above interactive champagne water.

## Open

Double-click `index.html`. No install or build. Three.js r128 is bundled in `src/vendor/`.

## Layers (bottom → top)

| Layer | What | File |
|-------|------|------|
| CSS sky | Gradient behind the canvas; horizon aligned to the 3D horizon via `--horizon` | `src/styles/background.css` |
| `#scene` canvas — layer 0 | Water: ripple sim, swell, concentric rings, grading, card reflection + contact shadow | `src/scene/water.js` |
| `#scene` canvas — layer 1 | Floating card placeholder, lights, environment | `src/scene/card.js` |
| `.layer-content` | Four corner zones | `src/styles/content.css` |
| `.layer-nav` | Navigation | `src/styles/nav.css` |

`src/main.js` wires them: renderer, camera, reflection pass, pointer, loop.

## The AVORA card

`src/scene/card.js` builds a two-sided card: thin metal edge + front and back faces textured
with the original artwork in `src/assets/` (`avora-front.png`, `avora-back.png`, untouched).
Both faces are 1065 × 1477 (1.387 : 1); the card body uses that ratio and a 6.4 % corner radius.

- Click / tap the card to turn it over; it turns home on its own after 6 s, or on a second click.
- Keyboard: Tab to the hidden "Turn the card over" button.
- Opened from disk (file://), browsers block WebGL from reading local PNGs, so the page loads
  `src/assets/avora-textures.js` (the same PNG bytes as data URIs) instead. On a web server the
  PNGs are loaded directly and that file is never downloaded.

Card placement: `CARD_Z` and `{ y, height }` in `src/main.js`. Lean / turn feel: `rest`,
`FLIP_K`, `AUTO_RETURN` in `src/scene/card.js`.

## Scroll journey: Reveal → Journey → Destination

Three sections, driven entirely by scroll (GSAP ScrollTrigger, `scrub`). No clicks, no autoplay;
scrolling up reverses everything.

| Section | Scroll | What happens |
|---|---|---|
| 1 Reveal (`#hero`) | 0–100vh | The hero, unchanged. The card hands over from its float. |
| 2 Journey (`#journey`, 200vh) | 10–250vh | The card travels down and back through Z on one smooth spline (a soft S), and makes one slow 360° turn. Tilt and lean settle to 0. No wallet yet. |
| 3 Destination (`#destination`, pinned +150%) | 255–450vh | The wallet scrolls in and pins; the card rises ahead of it, aligns above the slot, slides in (318–418), the pocket mouth responds, and the wallet holds the final frame. |

- `src/scene/journey.js` — one master GSAP timeline whose time unit is vh of scroll; it tweens plain
  numbers (`travel`, `turn`, `approach`, `insert`, `mouth`…) that are turned into poses each frame.
  `dispose()` kills the timeline and the pin.
- `#scene` is a fixed canvas, two passes per frame: hero sky + water + halo (shifted with the scroll and
  clipped to the hero), then card + wallet (viewport-fixed).
- GSAP 3.12.5 + ScrollTrigger are bundled in `src/vendor/`.

## Fonts

Gilroy (SVN) woff2 in `src/fonts/`. Delete `src/fonts/Font-Gilroy-VH-Full/` before deploying,
and check that your Gilroy licence covers web embedding.

## Unused leftovers

`package.json`, `src/components/card.js`, `src/styles/card.css`, `src/scene/sequence.js` and `src/scene/scroll.js` are from earlier versions and can be deleted.
