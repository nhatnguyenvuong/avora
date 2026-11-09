/*
  AVORA — scene orchestration.

  Page (bottom → top):
    sections 2–3         journey space + the wallet stage (pinned by ScrollTrigger)
    #scene canvas        fixed to the viewport, two passes per frame:
        1. hero pass   — sky + water + halo, drawn with the hero camera shifted by the
                         scroll offset (setViewOffset), clipped to the hero's visible
                         rectangle → the water scrolls away exactly like the page
        2. object pass — card + wallet, drawn with the same camera unshifted →
                         the card stays in the viewport and travels to the wallet
    .hero content / nav  above the canvas

  Layers: 0 water · 1 card · 2 halo · 3 wallet
*/
(function () {
  "use strict";

  var canvas = document.getElementById("scene");
  var fallback = document.getElementById("scene-fallback");
  if (!window.THREE || !window.AvoraWater || !window.AvoraCard) { fallback.hidden = false; return; }

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) { fallback.hidden = false; return; }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  // these only affect built-in materials (card, wallet); the water shader is graded by hand
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  var LAYER = { water: 0, card: AvoraCard.LAYER, halo: 2, wallet: 3 };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isSmall = Math.min(window.innerWidth, window.innerHeight) < 600;

  var scene = new THREE.Scene();
  // hero camera: water + halo (shifted with the scroll)
  var camera = new THREE.PerspectiveCamera(36, 1, 0.05, 200);
  camera.layers.set(LAYER.water);
  camera.layers.enable(LAYER.halo);
  // object camera: same lens, never shifted — card + wallet
  var objCam = new THREE.PerspectiveCamera(36, 1, 0.05, 200);
  objCam.layers.set(LAYER.card);
  objCam.layers.enable(LAYER.wallet);

  var CARD_Z = -4.2;
  var WATER_Y = -0.45;
  var water = AvoraWater.create(renderer, { isSmall: isSmall, originZ: CARD_Z - 0.3, waterY: WATER_Y });
  scene.add(water.mesh);
  var card = AvoraCard.create(renderer, scene, { z: CARD_Z, y: 1.34, height: 2.3 });
  var halo = window.AvoraHalo
    ? AvoraHalo.create(scene, { x: 0, z: -8.5, radius: 3.0, waterY: WATER_Y, submerged: 3 / 7, fade: 1.3, layer: LAYER.halo })
    : null;

  // Sections 2–3: the card's journey (GSAP ScrollTrigger) and the wallet in Section 3
  var heroEl = document.getElementById("hero");
  var stageEl = document.getElementById("wallet-stage");
  var anchorEl = document.getElementById("wallet-anchor");
  var wallet = window.AvoraWallet
    ? AvoraWallet.create(scene, { rotX: 0, rotY: 0, layer: LAYER.wallet })   // straight, facing the viewer
    : null;
  var journey = (wallet && window.AvoraJourney && stageEl && anchorEl)
    ? AvoraJourney.create({
        card: card, wallet: wallet, camera: objCam, stageEl: stageEl, anchorEl: anchorEl, walletZ: -9,
        journeyStageEl: document.getElementById("journey-stage"),
        message1El: document.getElementById("story-01"),
        message2El: document.getElementById("story-02"),
        finaleEl: document.getElementById("final-message"),
        finaleCtaEl: document.getElementById("final-cta"),
        seatRippleEl: document.getElementById("seat-ripple"),
        coverEl: document.getElementById("ecosystem")         // Section 4 slides over the stage
      })
    : null;

  /* Soft hand-off at the bottom of the hero: the water fades into Section 2's tone.
     Drawn in the hero pass, before the card, so it never veils the card. */
  var fadeScene = new THREE.Scene();
  var fadeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var s2Top = getComputedStyle(document.documentElement).getPropertyValue("--s2-top").trim() || "#efe9dc";
  var fadeMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(s2Top) },        // used as-is (sRGB), like the CSS
      uBottom: { value: 0 },                              // hero bottom, px from the top
      uLength: { value: 160 },                            // fade length in px
      uViewH: { value: 1 }
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: [
      "uniform vec3 uColor; uniform float uBottom; uniform float uLength; uniform float uViewH;",
      "varying vec2 vUv;",
      "void main(){",
      "  float yTop = (1.0 - vUv.y) * uViewH;",                      // px from the top
      "  float a = smoothstep(uBottom - uLength, uBottom, yTop);",
      "  gl_FragColor = vec4(uColor, a);",
      "}"
    ].join("\n")
  });
  fadeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat));

  /* Hero sky, drawn in the canvas (not CSS) so it can never drift from the water
     while scrolling. Same colours and geometry as the CSS gradient it replaces. */
  function cssColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return new THREE.Color(v || fallback);
  }
  var skyScene = new THREE.Scene();
  var skyMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: {
      uZenith: { value: cssColor("--sky-zenith", "#ebe6dc") },
      uMid: { value: cssColor("--sky-mid", "#f2efe8") },
      uHorizonCol: { value: cssColor("--sky-horizon", "#f9f7f2") },
      uHaze: { value: new THREE.Vector4(252 / 255, 246 / 255, 232 / 255, 0.5) },
      uHorizon: { value: 0.42 },        // horizon, as a fraction of the hero's height
      uScroll: { value: 0 },            // px the hero has moved up
      uHeroH: { value: 1 },
      uViewW: { value: 1 }, uViewH: { value: 1 }
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: [
      "uniform vec3 uZenith, uMid, uHorizonCol; uniform vec4 uHaze;",
      "uniform float uHorizon, uScroll, uHeroH, uViewW, uViewH;",
      "varying vec2 vUv;",
      "void main(){",
      "  float y = ((1.0 - vUv.y) * uViewH + uScroll) / uHeroH;",     // 0 at the hero's top edge
      "  float x = vUv.x;",
      "  float h = uHorizon;",
      "  vec3 c = mix(uZenith, uMid, smoothstep(0.0, h * 0.55, y));",
      "  c = mix(c, uHorizonCol, smoothstep(h * 0.55, h - 0.02, y));",
      // radial haze: 48% × 12% ellipse centred on the horizon
      "  vec2 d = vec2((x - 0.5) / 0.48, (y - h) / 0.12);",
      "  float haze = clamp(1.0 - length(d), 0.0, 1.0) * uHaze.a;",
      "  c = mix(c, uHaze.rgb, haze);",
      "  gl_FragColor = vec4(c, 1.0);",
      "}"
    ].join("\n")
  });
  skyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat));

  /* Planar reflection of the card (and halo) onto the water */
  var REFL = isSmall ? 256 : 512;
  var reflRT = new THREE.WebGLRenderTarget(Math.round(REFL * 0.9), REFL, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  var reflCam = new THREE.PerspectiveCamera(46, 0.9, 0.05, 200);
  reflCam.layers.set(LAYER.card);
  reflCam.layers.enable(LAYER.halo);
  var bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  water.uniforms.uReflect.value = reflRT.texture;
  water.uniforms.uReflectOn.value = 1;

  function renderReflection() {
    // mirror the (unshifted) camera through the water plane and aim at the card
    reflCam.position.set(objCam.position.x, 2 * WATER_Y - objCam.position.y, objCam.position.z);
    reflCam.lookAt(card.group.position.x, 2 * WATER_Y - card.group.position.y, card.group.position.z);
    reflCam.updateMatrixWorld();
    water.uniforms.uReflectMatrix.value.copy(bias).multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse);
    renderer.setRenderTarget(reflRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    if (halo) halo.setReflectionPass(true);
    renderer.render(scene, reflCam);
    if (halo) halo.setReflectionPass(false);
    renderer.setRenderTarget(null);
  }

  /* Layout */
  var vw = 1, vh = 1;
  var horizonProbe = new THREE.Vector3();
  function resize() {
    vw = window.innerWidth; vh = window.innerHeight;
    renderer.setSize(vw, vh, false);
    AvoraWater.placeCamera(camera, vw / vh);
    AvoraWater.placeCamera(objCam, vw / vh);
    if (halo) halo.setRadius(vw / vh < 1 ? 2.45 : 3.0);
    camera.clearViewOffset();
    horizonProbe.set(0, camera.position.y, -5000).project(camera);
    var pct = (1 - (horizonProbe.y + 1) / 2) * 100;
    document.documentElement.style.setProperty("--horizon", pct.toFixed(2) + "%");
    skyMat.uniforms.uHorizon.value = pct / 100;
  }
  window.addEventListener("resize", resize);
  resize();

  /* Pointer — ripples on the hero water, hover/turn on the card while it floats */
  var raycaster = new THREE.Raycaster();
  var cardRay = new THREE.Raycaster();
  var ndc = new THREE.Vector2();

  function pointerNdc(ev) {
    ndc.x = (ev.clientX / vw) * 2 - 1;
    ndc.y = -(ev.clientY / vh) * 2 + 1;
  }
  function hitWater() {
    if (heroBottom() <= 0) return null;
    raycaster.setFromCamera(ndc, camera);            // camera carries the scroll offset
    return raycaster.intersectObject(water.mesh, false)[0];
  }
  function overCardNow() {
    if (journey && journey.active()) return false;     // the card belongs to the scroll once it moves
    cardRay.setFromCamera(ndc, objCam);
    return card.hit(cardRay);
  }
  function onUi(ev) { return ev.target.closest && ev.target.closest("a, button"); }

  window.addEventListener("pointermove", function (ev) {
    pointerNdc(ev);
    var over = !onUi(ev) && overCardNow();
    if (!over) water.stir(hitWater());
    card.setPointer(ndc.x, ndc.y);
    document.body.classList.toggle("is-over-card", over);
  }, { passive: true });

  window.addEventListener("pointerdown", function (ev) {
    if (onUi(ev)) return;
    pointerNdc(ev);
    if (overCardNow()) { card.toggle(); return; }    // click the floating card to turn it over
    water.drop(hitWater());
  });

  var flipBtn = document.getElementById("card-flip");
  if (flipBtn) {
    flipBtn.addEventListener("click", function () {
      card.toggle();
      flipBtn.setAttribute("aria-pressed", card.isFlipped() ? "true" : "false");
    });
  }

  document.addEventListener("pointerleave", function () { water.release(); card.setPointer(0, 0); });
  window.addEventListener("blur", function () { card.setPointer(0, 0); });

  window.AvoraHero = { journey: journey };

  /* Loop */
  function heroBottom() {                    // px of the hero still on screen
    return Math.min(vh, heroEl.getBoundingClientRect().bottom);
  }

  var clock = new THREE.Clock();
  var time = 0;
  var running = true;

  function frame() {
    if (!running) return;
    var dt = Math.min(clock.getDelta(), 1 / 20);
    time += reduceMotion ? dt * 0.25 : dt;

    card.update(dt, time);
    if (card.isFlipped() && journey && journey.active()) card.showFront();
    if (journey) journey.apply();
    if (halo) halo.update(time);
    water.setCard(card.group.position.x, card.group.position.z, card.lift(WATER_Y));

    renderer.setRenderTarget(null);
    renderer.setScissorTest(false);
    renderer.clear(true, true, true);

    // 1 — hero pass, only while some of the hero is on screen
    var hb = heroBottom();
    if (hb > 0) {
      water.update(time);
      renderReflection();
      var scrolled = Math.max(0, -heroEl.getBoundingClientRect().top);   // px the hero has moved up
      camera.setViewOffset(vw, vh, 0, scrolled, vw, vh);
      renderer.setScissorTest(true);
      renderer.setScissor(0, vh - hb, vw, hb);      // scissor origin is bottom-left
      skyMat.uniforms.uScroll.value = scrolled;
      skyMat.uniforms.uHeroH.value = heroEl.offsetHeight;
      skyMat.uniforms.uViewW.value = vw; skyMat.uniforms.uViewH.value = vh;
      renderer.render(skyScene, fadeCam);
      renderer.render(scene, camera);
      fadeMat.uniforms.uBottom.value = hb;
      fadeMat.uniforms.uViewH.value = vh;
      fadeMat.uniforms.uLength.value = Math.min(220, vh * 0.22);
      renderer.render(fadeScene, fadeCam);
      renderer.setScissorTest(false);
    }

    // 2 — object pass: card + wallet, over the hero.
    // After the story, Section 4 slides up over the pinned stage (and this canvas);
    // once it covers the screen the pass is skipped.
    var past = journey ? journey.pastEnd() : 0;
    if (past < vh) {
      renderer.clearDepth();
      renderer.render(scene, objCam);
    }

    requestAnimationFrame(frame);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { running = false; }
    else if (!running) { running = true; clock.getDelta(); requestAnimationFrame(frame); }
  });

  window.addEventListener("pagehide", function () { if (journey) journey.dispose(); });

  requestAnimationFrame(frame);
})();
