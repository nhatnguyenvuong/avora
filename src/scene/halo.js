/*
  Halo — a thin luminous ring standing behind the card, rising out of the water
  (its lower part sits below the surface, hidden by the water's depth, and the
  ring dissolves into the water as it approaches the surface).
  One camera-facing quad with a small shader: a fine metallic champagne core,
  soft champagne-white diffusion, a brighter reflection along one short arc,
  and a very slow breathing of its luminosity. No rotation, no pulsing.
  It sits on the card's layer so it also reflects in the water.
  Exposes window.AvoraHalo.create(scene, opts).
*/
(function () {
  "use strict";

  function create(scene, opts) {
    opts = opts || {};
    var R = opts.radius || 1.7;          // ring radius (world units)
    var SPREAD = 1.1;                    // room for the glow around the ring
    var SIZE = (R + SPREAD) * 2;

    var uniforms = {
      uTime: { value: 0 },
      uR: { value: R },
      uCore: { value: 0.008 },            // half-width of the metal core
      uHighlightAngle: { value: 0.82 },  // radians from +x: upper right, where the low sun catches it
      uCoreColor: { value: new THREE.Vector3(0.87, 0.80, 0.66) },    // brushed champagne metal
      uGlowColor: { value: new THREE.Vector3(1.0, 0.988, 0.962) },   // champagne-white light
      uBreath: { value: 1.0 },
      uOpacity: { value: 1.0 },
      uClipOn: { value: 0 },
      uClipY: { value: opts.waterY != null ? opts.waterY : 0 },
      uFade: { value: opts.fade || 1.3 }            // height above the water over which the ring dissolves
    };

    var material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.NormalBlending,
      vertexShader: [
        "varying vec2 vP;",
        "varying float vWorldY;",
        "void main(){",
        "  vP = position.xy;",
        "  vWorldY = (modelMatrix * vec4(position, 1.0)).y;",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "precision highp float;",
        "uniform float uTime;",
        "uniform float uR;",
        "uniform float uCore;",
        "uniform float uHighlightAngle;",
        "uniform vec3 uCoreColor;",
        "uniform vec3 uGlowColor;",
        "uniform float uBreath;",
        "uniform float uOpacity;",
        "uniform float uClipOn;",
        "uniform float uClipY;",
        "uniform float uFade;",
        "varying vec2 vP;",
        "varying float vWorldY;",
        "void main(){",
        // in the reflection pass, drop the part that is under the water
        "  if (uClipOn > 0.5 && vWorldY < uClipY) discard;",
        "  float r = length(vP);",
        "  float d = abs(r - uR);",
        "  float a = atan(vP.y, vP.x);",
        "  float px = fwidth(r);",                                   // world units per pixel here

        // reflection along a short arc (upper right) and a faint answering one (lower left)
        "  float hl = pow(max(cos(a - uHighlightAngle), 0.0), 22.0);",
        "  float hl2 = pow(max(cos(a - uHighlightAngle - 3.14159), 0.0), 40.0) * 0.35;",
        "  float lit = hl + hl2;",

        // soft gaussian core, never thinner than ~1.5 px → no stair-stepping, no hard rim
        "  float w = max(uCore * (1.0 + lit * 0.8), px * 1.5);",
        "  float core = exp(-(d * d) / (w * w));",

        // diffusion: tight bloom + wide soft haze, stronger near the highlight
        "  float bloom = exp(-d / max(0.06, px * 4.0)) * (0.20 + lit * 0.95);",
        "  float haze  = exp(-d / 0.42) * (0.07 + lit * 0.24);",

        // one warm family of tones for core and glow, brightening toward white only where lit,
        // so the ring has no darker edge around a lighter centre
        "  vec3 coreCol = mix(uCoreColor, uGlowColor, 0.35 + lit * 0.65);",
        "  vec3 glowCol = mix(mix(uCoreColor, uGlowColor, 0.7), uGlowColor, lit);",
        "  float coreA = core * (0.58 + lit * 0.42) * uBreath;",
        "  float glowA = (bloom + haze) * uBreath;",
        "  coreA *= uOpacity; glowA *= uOpacity;",

        // fade out as the ring meets the water, as if it dissolves into it
        "  float sink = smoothstep(uClipY + 0.02, uClipY + uFade, vWorldY);",
        "  sink = sink * sink * (3.0 - 2.0 * sink);",
        "  coreA *= sink; glowA *= sink;",

        // correct 'over' compositing of core on top of glow (premultiplied), never above 1
        "  vec3 col = coreCol * coreA + glowCol * glowA * (1.0 - coreA);",
        "  float alpha = clamp(coreA + glowA * (1.0 - coreA), 0.0, 1.0);",
        "  col = min(col, vec3(alpha));",
        "  if (alpha < 0.002) discard;",
        "  gl_FragColor = vec4(col, alpha);",
        "}"
      ].join("\n"),
      extensions: { derivatives: true }   // fwidth for pixel-accurate width
    });

    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE, 1, 1), material);
    var WATER_Y = opts.waterY != null ? opts.waterY : 0;
    var SUBMERGED = opts.submerged != null ? opts.submerged : 1 / 3;   // share of the ring's height under water
    mesh.position.set(opts.x || 0, 0, opts.z || -5.3);

    // scale the ring (glow included) and keep the same share of it below the water line
    function setRadius(r) {
      mesh.scale.setScalar(r / R);
      // bottom = WATER_Y - 2r·SUBMERGED, so centre = bottom + r
      mesh.position.y = WATER_Y + r - 2 * r * SUBMERGED;
    }
    setRadius(R);
    mesh.renderOrder = 1;                // after the water, before nothing that matters
    if (opts.layer != null) mesh.layers.set(opts.layer);
    scene.add(mesh);

    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function update(time) {
      uniforms.uTime.value = time;
      // extremely slow, slightly irregular breathing of the light (±6 %)
      uniforms.uBreath.value = reduce ? 1.0
        : 1.0 + Math.sin(time * 0.42) * 0.045 + Math.sin(time * 0.17 + 1.1) * 0.02;
    }

    function setReflectionPass(on) { uniforms.uClipOn.value = on ? 1 : 0; }
    function setOpacity(a) { uniforms.uOpacity.value = a; mesh.visible = a > 0.002; }

    return { mesh: mesh, update: update, setRadius: setRadius, radius: R, setReflectionPass: setReflectionPass, setOpacity: setOpacity };
  }

  window.AvoraHalo = { create: create };
})();
