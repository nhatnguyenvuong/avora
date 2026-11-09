/*
  AVORA card journey — Section 1 → 2 → 3, driven by GSAP ScrollTrigger (scrub).

  One master timeline spans the whole page scroll. Its time unit is "vh of scroll",
  so every label below is literally where it happens on the page:

      0 ──── 100 ──── 200 ──── 300 ───────────── 500 vh
      │ S1   │ S2 pinned│ S2 out │ S3 pinned       │
      Reveal  Beyond borders      Everything comes together

    0  – 20   card hands over from its float
    58 – 121  Section 2 · Message 01 fades up (top-left)
    128 – 191 Section 2 · Message 02 fades up (bottom-right), mid-turn
    10 – 245  journey: down and back through Z along a soft S-curve, ending above the slot
    20 – 250  one slow 360° turn about the vertical axis; tilt/lean settle to 0
    232 – 372 drop: straight down into the already-open pocket, flowing on from the
              journey with no pause; the wallet rises to meet it and pins at 300.
              The card seats with its top showing above the mouth (as in the art direction).
    356 – 400 seat light: a restrained glow at the slot + a ripple beneath the wallet
    372 – 398 mouth settles closed against the card → the composition holds still
    402 – 452 final message fades up (eyebrow, headline, text); CTA 430 – 470
    470 – 500 hold on the final frame

  GSAP only tweens plain numbers on `state`; apply() turns them into the card and
  wallet poses every frame — both from the same timeline time, so they stay in sync.
  Exposes window.AvoraJourney.create(opts).
*/
(function () {
  "use strict";

  function create(o) {
    var gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
    if (!gsap || !ScrollTrigger) return null;
    gsap.registerPlugin(ScrollTrigger);

    var card = o.card, wallet = o.wallet, cam = o.camera;
    var stageEl = o.stageEl, anchorEl = o.anchorEl;
    var rest = card.rest, base = card.base;
    var WALLET_Z = o.walletZ != null ? o.walletZ : -9;
    var SHOWING = o.cardShowing != null ? o.cardShowing : 0.95;   // card above the mouth when seated (world units; card is 2.3 tall)

    // everything GSAP animates
    var state = {
      take: 0,                                   // 0 = live float, 1 = journey owns the card
      travel: 0,                                 // 0 → 1 along the journey curve
      turn: 0,                                   // 0 → 1: one full turn, settling straight
      lean: 0,                                   // 0 → 1: a slight forward lean, in and out
      settle: 0,                                 // 0 → 1: resting tilt/lean fade to 0
      drop: 0,                                   // 0 → 1: straight down from above the slot into the pocket
      mouth: 0.15,                               // pocket mouth: already open when the wallet appears
      glow: 0                                    // seat light at the slot
    };

    /* Section 2 pin: the editorial stage holds for 100vh while the card turns.
       (Created before Section 3's pin so ScrollTrigger measures them top to bottom.)
       Stage 100vh + spacer 100vh = the same 200vh of scroll as before, so every
       timeline position below is unchanged. */
    var s2Pin = o.journeyStageEl ? ScrollTrigger.create({
      trigger: o.journeyStageEl,
      start: "top top",
      end: "+=100%",
      pin: true,
      pinSpacing: true
    }) : null;

    /* Section 3 pin: the wallet stage holds still while the card goes in (200vh), and then
       for one more viewport while Section 4 slides up over it (the stacked hand-over).
       Section 4 is pulled up by one viewport (negative margin) so it starts directly below
       the screen exactly when the story ends, and fully covers the stage as the pin releases. */
    var coverEl = o.coverEl || null;
    function placeCover() { if (coverEl) coverEl.style.marginTop = (-window.innerHeight) + "px"; }
    placeCover();
    ScrollTrigger.addEventListener("refreshInit", placeCover);
    var pin = ScrollTrigger.create({
      trigger: stageEl,
      start: "top top",
      end: coverEl ? "+=300%" : "+=200%",
      pin: true,
      pinSpacing: true
    });
    // where the story ends = where Section 4 starts to rise
    function storyEnd() { return coverEl ? pin.end - window.innerHeight : pin.end; }

    /* Corner morph during the hand-over: the stage's bottom corners round off (0 → 28px)
       as Section 4 rises. Its own ScrollTrigger (not nested in the story timeline). */
    var cover = (coverEl && stageEl) ? gsap.fromTo(stageEl,
      { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
      { borderBottomLeftRadius: 28, borderBottomRightRadius: 28, ease: "none",
        scrollTrigger: { trigger: coverEl, start: "top bottom", end: "top top", scrub: true } }) : null;

    var tl = gsap.timeline({
      defaults: { ease: "sine.inOut" },
      scrollTrigger: {
        trigger: document.documentElement,
        start: 0,
        end: storyEnd,                            // the story ends where Section 4 starts to cover the stage
        scrub: 0.5,                               // light smoothing; card AND wallet both follow it
        invalidateOnRefresh: true
      }
    });

    // hand-over from the live float
    tl.to(state, { take: 1, duration: 20 }, 0);

    // Section 2 messages — sequential, on the same scroll timeline (so they reverse too).
    // A short fade with a slight rise; eyebrow, headline and text follow one another.
    function reveal(el, at) {
      if (!el) return;
      var parts = el.children.length ? el.children : [el];
      tl.fromTo(parts, { autoAlpha: 0, y: 26 },
        { autoAlpha: 1, y: 0, duration: 45, stagger: 9, ease: "power2.out", immediateRender: true }, at);
    }
    reveal(o.message1El, 58);     // as Section 2 arrives and the card is under way   (58 → 121)
    reveal(o.message2El, 128);    // after Message 01 has settled, mid-turn            (128 → 191)

    // the journey: one smooth curve — down, back through Z, a gentle S in x
    // (a single eased parameter along a spline, so the card never stops mid-way)
    // It ends just above the slot of the (pinned) wallet, so Section 3 is a straight drop.
    var hover = new THREE.Vector3();                  // updated every frame (depends on the viewport)
    var path = new THREE.CatmullRomCurve3([
      base.clone(),
      new THREE.Vector3(0.45, 0.9, -5.6),
      new THREE.Vector3(-0.25, 0.55, -7.2),
      hover
    ], false, "centripetal");
    tl.to(state, { travel: 1, duration: 235, ease: "sine.inOut" }, 10);

    // one slow, deliberate turn; orientation settles straight (all angles 0) by its end
    tl.to(state, { turn: 1, duration: 230, ease: "sine.inOut" }, 20);
    tl.to(state, { lean: 1, duration: 200, ease: "none" }, 30);
    tl.to(state, { settle: 1, duration: 120 }, 20);

    // Section 3: one straight drop into the already-open pocket. It starts while the journey
    // is still finishing (no pause) and the wallet rises to meet the card as it pins.
    tl.to(state, { drop: 1, duration: 140, ease: "sine.inOut" }, 232);
    // the open mouth eases a touch wider as the card passes through, then settles against it
    tl.to(state, { mouth: 0.19, duration: 40, ease: "sine.inOut" }, 300);
    tl.to(state, { mouth: 0, duration: 26, ease: "sine.inOut" }, 372);

    // seat light: rises as the card reaches its seat, then rests at a soft level
    tl.to(state, { glow: 1, duration: 30, ease: "sine.inOut" }, 356);
    tl.to(state, { glow: 0.55, duration: 30, ease: "sine.inOut" }, 386);
    if (stageEl) {
      // the light beneath the wallet answers the same moment (CSS reads --seat)
      tl.fromTo(stageEl, { "--seat": 0 }, { "--seat": 1, duration: 36, ease: "sine.inOut", immediateRender: true }, 360);
    }
    if (o.seatRippleEl) {                              // one ring spreads out from under the wallet
      tl.fromTo(o.seatRippleEl, { scale: 0.3, autoAlpha: 0 },
        { scale: 1.35, duration: 52, ease: "sine.out", immediateRender: true }, 366);
      tl.to(o.seatRippleEl, { autoAlpha: 1, duration: 8, ease: "sine.out" }, 366);
      tl.to(o.seatRippleEl, { autoAlpha: 0, duration: 40, ease: "sine.in" }, 378);
    }

    // final message — only once the card has settled (same reveal as Section 2)
    reveal(o.finaleEl, 402);
    if (o.finaleCtaEl) {
      tl.fromTo(o.finaleCtaEl, { autoAlpha: 0, y: 18 },
        { autoAlpha: 1, y: 0, duration: 40, ease: "power2.out", immediateRender: true }, 430);
    }
    tl.set({}, {}, 500);                               // timeline length = 500 vh of scroll

    /* The wallet's position comes from the SAME timeline time as the card (not from the live
       DOM), so the two can never drift apart, however fast the page is scrolled.
       Its anchor is ANCHOR of the way down the stage; before the pin (t < 300) the stage is
       (300 − t) vh lower. */
    var ANCHOR = o.anchor != null ? o.anchor : 0.62;   // re-read from the CSS anchor on resize
    var PIN_AT = 300;
    var ndc = new THREE.Vector3(), dirV = new THREE.Vector3();
    function worldAtScreenY(fracY, out) {           // point at the wallet depth, screen centre-x
      ndc.set(0, 1 - 2 * fracY, 0.5).unproject(cam);
      dirV.copy(ndc).sub(cam.position).normalize();
      return out.copy(cam.position).addScaledVector(dirV, (WALLET_Z - cam.position.z) / dirV.z);
    }

    var e = new THREE.Euler(0, 0, 0, "ZXY");
    var q = new THREE.Quaternion(), qFloat = new THREE.Quaternion();
    var pinned = new THREE.Vector3(), offAbove = new THREE.Vector3(), offInside = new THREE.Vector3();
    var p = new THREE.Vector3(), tmpV = new THREE.Vector3();
    var HOVER = 0.35;                                 // card bottom this far above the mouth before the drop

    /* Layout probe (on load and whenever the viewport changes): the wallet's resting height
       comes from the CSS anchor, and the floor under it is handed back to CSS (--floor-y),
       so the light pool and ripples sit exactly under the wallet at any size. */
    var lastW = -1, lastH = -1, floorProbe = new THREE.Vector3();
    function measure() {
      lastW = window.innerWidth; lastH = window.innerHeight;
      if (anchorEl && stageEl && stageEl.offsetHeight) ANCHOR = anchorEl.offsetTop / stageEl.offsetHeight;
      worldAtScreenY(ANCHOR, pinned);
      floorProbe.copy(pinned); floorProbe.y += wallet.bottomY;
      floorProbe.project(cam);
      if (stageEl) stageEl.style.setProperty("--floor-y", ((1 - (floorProbe.y + 1) / 2) * 100).toFixed(2) + "%");
    }

    function apply() {
      var t = tl.time();                                // vh of scroll, smoothed by the scrub
      if (window.innerWidth !== lastW || window.innerHeight !== lastH) measure();

      // wallet: pinned position, and where it is now on its way in
      worldAtScreenY(ANCHOR, pinned);
      var yFrac = ANCHOR + Math.max(0, PIN_AT - t) / 100;
      worldAtScreenY(yFrac, wallet.group.position);
      wallet.group.visible = yFrac < 1.3;               // Section 3 only — never during the journey
      wallet.setOpen(state.mouth);
      if (wallet.setGlow) wallet.setGlow(state.glow, 0);    // rim light only — no light on the card face

      // pocket offsets (the wallet is straight, so these are constant offsets from its centre)
      offAbove.copy(wallet.pocketPoint(wallet.aboveY, tmpV)).sub(wallet.group.position);
      offInside.copy(wallet.pocketPoint(wallet.seatedY ? wallet.seatedY(SHOWING) : wallet.insideY, tmpV)).sub(wallet.group.position);

      // end of the journey = just above the slot of the pinned wallet
      hover.copy(pinned).add(offAbove);
      hover.y += HOVER;
      path.getPoint(state.travel, p);

      // the drop: straight down by the full distance into the pocket
      var dropDist = HOVER + (offAbove.y - offInside.y);
      p.y -= dropDist * state.drop;

      var yaw = rest.ry + (Math.PI * 2 - rest.ry) * state.turn;      // rest.ry → 2π (≡ 0): one turn
      var pitch = rest.rx * (1 - state.settle) + 0.1 * Math.sin(Math.PI * state.lean);
      var roll = rest.rz * (1 - state.settle);
      e.set(pitch, yaw, roll);                           // ends at (0, 2π, 0): straight, like the wallet
      q.setFromEuler(e);

      var w = state.take;
      if (w > 0) {
        qFloat.copy(card.group.quaternion);
        card.group.position.lerp(p, w);
        card.group.quaternion.copy(qFloat.slerp(q, w));
      }
    }

    function active() { return state.take > 0.003; }
    function progress() { return tl.time(); }           // vh of scroll the animation has reached
    // px the page has scrolled past the end of the story (Section 4 rising over the stage)
    function pastEnd() { return Math.max(0, (window.scrollY || window.pageYOffset) - storyEnd()); }
    function dispose() {
      if (tl.scrollTrigger) tl.scrollTrigger.kill();
      tl.kill();
      pin.kill(true);
      if (cover) { cover.scrollTrigger.kill(); cover.kill(); }
      ScrollTrigger.removeEventListener("refreshInit", placeCover);
      if (s2Pin) s2Pin.kill(true);
    }

    return { apply: apply, active: active, progress: progress, pastEnd: pastEnd, dispose: dispose, timeline: tl, state: state };
  }

  window.AvoraJourney = { create: create };
})();
