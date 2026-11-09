/*
  Champagne water — ported from the water-surface experiment.
  Same ripple simulation, ambient swell, concentric rings, grading and camera.
  Additions for the hero:
    · uReflect / uReflectMatrix : planar reflection of the card layer
    · uCardP / uCardLift        : soft contact shadow under the floating card
  Exposes window.AvoraWater.create(renderer, opts).
*/
(function () {
  "use strict";

  function create(renderer, opts) {
    opts = opts || {};
    var isSmall = !!opts.isSmall;

    /* World layout — plane-local p = (uv - 0.5) * PLANE, p.y = PLANE_Z - world z */
    var PLANE = 90;
    var PLANE_Z = -34;
    var ORIGIN_Z = opts.originZ != null ? opts.originZ : -7;
    var SIM_SIZE = 22;
    var SIM_CENTER_Z = -6.5;
    var WATER_Y = opts.waterY != null ? opts.waterY : 0;   // surface height in world space

    function worldZtoP(z) { return PLANE_Z - z; }
    var originP = new THREE.Vector2(0, worldZtoP(ORIGIN_Z));
    var simCenterP = new THREE.Vector2(0, worldZtoP(SIM_CENTER_Z));

    /* ---------------- 1. Cursor ripple simulation ---------------- */
    var SIM = isSmall ? 256 : 512;
    var MAX_DROPS = 8;
    var rtOpts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false
    };
    var rtA = new THREE.WebGLRenderTarget(SIM, SIM, rtOpts);
    var rtB = new THREE.WebGLRenderTarget(SIM, SIM, rtOpts);

    var dropData = [];
    for (var i = 0; i < MAX_DROPS; i++) dropData.push(new THREE.Vector4(0, 0, 0, 0));

    var simMat = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null },
        uTexel: { value: new THREE.Vector2(1 / SIM, 1 / SIM) },
        uDrops: { value: dropData },
        uDamping: { value: 0.988 }
      },
      vertexShader: [
        "varying vec2 vUv;",
        "void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }"
      ].join("\n"),
      fragmentShader: [
        "precision highp float;",
        "uniform sampler2D uPrev;",
        "uniform vec2 uTexel;",
        "uniform vec4 uDrops[" + MAX_DROPS + "];",
        "uniform float uDamping;",
        "varying vec2 vUv;",
        "const float PI = 3.14159265;",
        "void main(){",
        "  vec4 d = texture2D(uPrev, vUv);",
        "  float avg = ( texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).r",
        "              + texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).r",
        "              + texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).r",
        "              + texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).r ) * 0.25;",
        "  float vel = (d.g + (avg - d.r) * 2.0) * uDamping;",
        "  float h = (d.r + vel) * 0.998;",
        "  for (int i = 0; i < " + MAX_DROPS + "; i++) {",
        "    vec4 dr = uDrops[i];",
        "    if (dr.w == 0.0) continue;",
        "    float dist = length(vUv - dr.xy) / dr.z;",
        "    if (dist < 1.0) h -= (cos(dist * PI) * 0.5 + 0.5) * dr.w;",
        "  }",
        "  vec2 e = smoothstep(0.0, 0.08, vUv) * smoothstep(0.0, 0.08, 1.0 - vUv);",
        "  float edge = e.x * e.y;",
        "  gl_FragColor = vec4(h * edge, vel * edge, 0.0, 1.0);",
        "}"
      ].join("\n"),
      depthTest: false,
      depthWrite: false
    });

    var simScene = new THREE.Scene();
    var simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat));

    function clearTarget(rt) {
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
    }
    clearTarget(rtA); clearTarget(rtB);
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0);

    /* ---------------- 2. Water surface shader ---------------- */
    var RINGS = 6;

    var common = [
      "uniform sampler2D uSim;",
      "uniform float uTime;",
      "uniform float uPlane;",
      "uniform vec2 uOrigin;",
      "uniform vec2 uSimCenter;",
      "uniform float uSimSize;",
      "uniform float uSimScale;",
      "uniform float uRingPeriod;",
      "uniform float uRingSpeed;",

      "float hash1(float n){ return fract(sin(n * 91.345) * 47453.5453); }",
      "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
      "float noise(vec2 p){",
      "  vec2 i = floor(p); vec2 f = fract(p);",
      "  vec2 u = f * f * (3.0 - 2.0 * f);",
      "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),",
      "             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);",
      "}",

      "float swell(vec2 p, float t){",
      "  float h = 0.0;",
      "  h += sin(dot(p, vec2(0.80, 0.60)) * 0.55 + t * 0.45) * 0.030;",
      "  h += sin(dot(p, vec2(-0.45, 0.89)) * 0.95 + t * 0.62) * 0.016;",
      "  h += (noise(p * 0.35 + vec2(t * 0.05, -t * 0.04)) - 0.5) * 0.040;",
      "  return h;",
      "}",

      "float detail(vec2 p, float t){",
      "  float h = 0.0;",
      "  h += sin(dot(p, vec2(0.96, -0.28)) * 2.6 + t * 1.10) * 0.0045;",
      "  h += sin(dot(p, vec2(-0.70, -0.71)) * 4.3 + t * 1.45) * 0.0028;",
      "  h += (noise(p * 1.8 - vec2(t * 0.12, t * 0.09)) - 0.5) * 0.010;",
      "  h += (noise(p * 5.0 + vec2(t * 0.30, t * 0.22)) - 0.5) * 0.0028;",
      "  return h;",
      "}",

      "float rings(vec2 p, float t){",
      "  float r = length(p - uOrigin);",
      "  float life = uRingPeriod * " + RINGS + ".0;",
      "  float h = 0.0;",
      "  for (int k = 0; k < " + RINGS + "; k++) {",
      "    float tk = t + float(k) * uRingPeriod;",
      "    float age = mod(tk, life);",
      "    float cycle = floor(tk / life) * " + RINGS + ".0 + float(k);",
      "    float amp = 0.55 + 0.45 * hash1(cycle);",
      "    float R = age * uRingSpeed;",
      "    float d = r - R;",
      "    float packet = exp(-d * d * 1.6) * cos(d * 6.2);",
      "    float born = smoothstep(0.0, 1.4, age);",
      "    float fade = pow(1.0 - age / life, 1.6);",
      "    float spread = 1.0 / (1.0 + r * 0.22);",
      "    h += packet * amp * born * fade * spread;",
      "  }",
      "  h += exp(-r * r * 1.2) * sin(t * 1.4) * 0.25;",
      "  return h * 0.034;",
      "}",

      "vec2 simUv(vec2 p){ return (p - uSimCenter) / uSimSize + 0.5; }",
      "float simH(vec2 p){",
      "  vec2 s = simUv(p);",
      "  vec2 inside = step(vec2(0.0), s) * step(s, vec2(1.0));",
      "  return texture2D(uSim, s).r * inside.x * inside.y;",
      "}"
    ].join("\n");

    var uniforms = {
      uSim: { value: rtA.texture },
      uTime: { value: 0 },
      uPlane: { value: PLANE },
      uOrigin: { value: originP },
      uSimCenter: { value: simCenterP },
      uSimSize: { value: SIM_SIZE },
      uSimScale: { value: 0.45 },
      uRingPeriod: { value: 2.4 },
      uRingSpeed: { value: 0.62 },
      uSimTexel: { value: SIM_SIZE / SIM },
      uSunDir: { value: new THREE.Vector3(0.0, 0.055, -1.0).normalize() },
      uFogNear: { value: 14.0 },
      uFogFar: { value: 62.0 },
      uHorizon: { value: new THREE.Vector3(0.976, 0.969, 0.949) },   // #F9F7F2 near-white ivory
      // card integration
      uReflect: { value: null },
      uReflectMatrix: { value: new THREE.Matrix4() },
      uReflectOn: { value: 0 },
      uCardP: { value: new THREE.Vector2(0, worldZtoP(ORIGIN_Z)) },
      uCardLift: { value: 0.4 }
    };

    var material = new THREE.ShaderMaterial({
      transparent: true,
      premultipliedAlpha: true,
      uniforms: uniforms,
      vertexShader: [
        "precision highp float;",
        common,
        "varying vec2 vP;",
        "varying vec3 vWorld;",
        "void main(){",
        "  vec2 p = (uv - 0.5) * uPlane;",
        "  vP = p;",
        "  vec3 pos = position;",
        "  pos.z += swell(p, uTime);",
        "  vec4 w = modelMatrix * vec4(pos, 1.0);",
        "  vWorld = w.xyz;",
        "  gl_Position = projectionMatrix * viewMatrix * w;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "precision highp float;",
        common,
        "uniform float uSimTexel;",
        "uniform vec3 uSunDir;",
        "uniform float uFogNear;",
        "uniform float uFogFar;",
        "uniform vec3 uHorizon;",
        "uniform sampler2D uReflect;",
        "uniform mat4 uReflectMatrix;",
        "uniform float uReflectOn;",
        "uniform vec2 uCardP;",
        "uniform float uCardLift;",
        "varying vec2 vP;",
        "varying vec3 vWorld;",

        "vec3 skyColor(vec3 r){",
        "  float y = clamp(r.y, 0.0, 1.0);",
        "  vec3 zenith = vec3(0.940, 0.918, 0.872);",
        "  vec3 mid    = vec3(0.968, 0.953, 0.918);",
        "  vec3 c = mix(uHorizon, mid, smoothstep(0.0, 0.12, y));",
        "  c = mix(c, zenith, smoothstep(0.12, 0.6, y));",
        "  float s = max(dot(r, uSunDir), 0.0);",
        "  vec3 gold = vec3(0.996, 0.957, 0.870);",
        "  c += gold * (pow(s, 12.0) * 0.07 + pow(s, 90.0) * 0.14);",
        "  return c;",
        "}",

        "float field(vec2 p, float t){ return detail(p, t) + rings(p, t); }",

        "void main(){",
        "  vec2 p = vP;",
        "  float dist = length(cameraPosition - vWorld);",
        "  float de = mix(0.03, 0.35, smoothstep(2.0, 40.0, dist));",
        "  vec2 dx = vec2(de, 0.0), dy = vec2(0.0, de);",
        "  float t = uTime;",

        "  float fL = swell(p - dx, t) + field(p - dx, t);",
        "  float fR = swell(p + dx, t) + field(p + dx, t);",
        "  float fD = swell(p - dy, t) + field(p - dy, t);",
        "  float fU = swell(p + dy, t) + field(p + dy, t);",
        "  vec2 slope = vec2(fR - fL, fU - fD) / (2.0 * de);",

        "  float se = uSimTexel;",
        "  float sL = simH(p - vec2(se, 0.0)), sR = simH(p + vec2(se, 0.0));",
        "  float sD = simH(p - vec2(0.0, se)), sU = simH(p + vec2(0.0, se));",
        "  vec2 sSlope = vec2(sR - sL, sU - sD) / (2.0 * se) * uSimScale;",
        "  slope += sSlope;",

        "  float rL = rings(p - dx, t), rR = rings(p + dx, t);",
        "  float rD = rings(p - dy, t), rU = rings(p + dy, t);",
        "  float edgeSlope = length(vec2(rR - rL, rU - rD) / (2.0 * de)) + length(sSlope);",

        "  slope *= mix(1.0, 0.2, smoothstep(8.0, 45.0, dist));",
        "  vec3 N = normalize(vec3(-slope.x, 1.0, slope.y));",

        "  vec3 V = normalize(cameraPosition - vWorld);",
        "  vec3 R = reflect(-V, N);",
        "  R.y = abs(R.y);",

        "  float cosT = max(dot(N, V), 0.0);",
        "  float F = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);",
        "  F = clamp(F, 0.46, 0.95);",

        "  vec3 deep    = vec3(0.720, 0.678, 0.616);",
        "  vec3 shallow = vec3(0.886, 0.863, 0.816);",
        "  vec3 body = mix(deep, shallow, smoothstep(1.5, 12.0, dist));",

        "  vec3 champagne = vec3(0.839, 0.718, 0.478);",
        "  vec3 refl = skyColor(R);",
        "  refl = mix(refl, refl * (champagne / 0.72), 0.06);",

        // planar reflection of the card, distorted by the same surface slope
        "  vec4 rc = uReflectMatrix * vec4(vWorld, 1.0);",
        "  vec2 ruv = rc.xy / rc.w + slope * vec2(0.05, 0.08);",
        "  vec2 bl = vec2(0.0, 0.006);",
        "  vec4 card = texture2D(uReflect, ruv) * 0.4",
        "            + texture2D(uReflect, ruv + bl) * 0.2 + texture2D(uReflect, ruv - bl) * 0.2",
        "            + texture2D(uReflect, ruv + bl * 2.2) * 0.1 + texture2D(uReflect, ruv - bl * 2.2) * 0.1;",
        "  card *= uReflectOn;",
        "  card.rgb = pow(clamp(card.rgb / max(card.a, 0.001), 0.0, 1.0), vec3(1.0 / 2.2));",
        "  vec2 toCard = (p - uCardP) * vec2(1.0, 0.55);",
        "  float near = exp(-dot(toCard, toCard) * 0.35);",
        "  refl = mix(refl, card.rgb * vec3(0.95, 0.92, 0.84), card.a * 0.6 * near);",

        "  vec3 col = mix(body, refl, F);",

        "  vec3 H = normalize(uSunDir + V);",
        "  float ndh = max(dot(N, H), 0.0);",
        "  vec3 gold = vec3(1.0, 0.965, 0.890);",
        "  col += gold * pow(ndh, 600.0) * 0.45;",
        "  col += mix(champagne, vec3(1.0), 0.55) * pow(ndh, 70.0) * 0.12;",

        "  float glint = noise(p * 7.0 + vec2(t * 0.9, -t * 0.7));",
        "  glint = smoothstep(0.55, 0.95, glint);",
        "  float front = smoothstep(0.03, 0.22, edgeSlope);",
        "  float towardSun = 0.35 + 0.65 * pow(max(dot(R, uSunDir), 0.0), 4.0);",
        "  col += gold * front * glint * towardSun * 0.12;",

        // soft ambient shadow under the floating card (wider and fainter the higher it floats)
        "  vec2 cd = (p - uCardP) * vec2(0.95, 1.6);",
        "  float spreadS = 1.0 + uCardLift * 1.2;",
        "  float shadow = exp(-dot(cd, cd) / (spreadS * spreadS)) * 0.16 / spreadS;",
        "  col *= 1.0 - shadow;",

        // highlight shoulder on the lit surface only — before the haze, so the horizon
        // colour reaches the screen exactly as declared and meets the CSS sky seamlessly
        "  float L = dot(col, vec3(0.299, 0.587, 0.114));",
        "  float knee = 0.86;",
        "  if (L > knee) {",
        "    float o = L - knee;",
        "    float Lc = knee + o / (1.0 + o * 5.0);",
        "    col *= Lc / L;",
        "  }",
        "  float fog = smoothstep(uFogNear * 0.7, uFogFar, dist);",
        "  fog = fog * fog * (3.0 - 2.0 * fog);",
        "  vec3 haze = mix(uHorizon, vec3(0.945, 0.930, 0.898), 0.25 * (1.0 - fog));",   // soft ivory before near-white
        "  col = mix(col, haze, fog * 0.6);",
        "  col = mix(col, uHorizon, smoothstep(0.45, 1.0, fog));",
        "  float alpha = 1.0 - smoothstep(uFogFar - 14.0, uFogFar + 6.0, dist);",

        "  gl_FragColor = vec4(col * alpha, alpha);",   // premultiplied for correct blending into the CSS sky
        "}"
      ].join("\n")
    });

    var SEG = isSmall ? 160 : 240;
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE, PLANE, SEG, SEG), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = PLANE_Z;
    mesh.position.y = WATER_Y;

    /* ---------------- 3. Pointer → normalized sim UV ---------------- */
    var pendingDrops = [];
    var lastDropUv = null;

    function simUvFromHit(hit) {
      if (!hit || !hit.uv) return null;
      var px = (hit.uv.x - 0.5) * PLANE, py = (hit.uv.y - 0.5) * PLANE;
      var u = (px - simCenterP.x) / SIM_SIZE + 0.5;
      var v = (py - simCenterP.y) / SIM_SIZE + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) return null;
      return new THREE.Vector2(u, v);
    }

    function queueDrop(uv, radius, strength) {
      if (pendingDrops.length >= MAX_DROPS) pendingDrops.shift();
      pendingDrops.push({ x: uv.x, y: uv.y, r: radius, s: strength });
    }

    function stir(hit) {
      var uv = simUvFromHit(hit);
      if (!uv) { lastDropUv = null; return; }
      var moved = lastDropUv ? uv.distanceTo(lastDropUv) : 1;
      if (moved > 0.005) {
        var steps = lastDropUv ? Math.min(3, Math.ceil(moved / 0.012)) : 1;
        var strength = Math.min(0.016 + (lastDropUv ? moved : 0) * 0.5, 0.04);
        for (var s = 1; s <= steps; s++) {
          var q = lastDropUv ? lastDropUv.clone().lerp(uv, s / steps) : uv;
          queueDrop(q, 0.014, strength);
        }
        lastDropUv = uv;
      }
    }

    function drop(hit) {
      var uv = simUvFromHit(hit);
      if (!uv) return;
      queueDrop(uv, 0.024, 0.22);
      lastDropUv = uv;
    }

    function release() { lastDropUv = null; }

    // ripple at a world position on the surface (used by the wallet sequence)
    function dropAt(worldX, worldZ, radius, strength) {
      var u = (worldX - simCenterP.x) / SIM_SIZE + 0.5;
      var v = (worldZtoP(worldZ) - simCenterP.y) / SIM_SIZE + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) return;
      queueDrop({ x: u, y: v }, radius, strength);
    }

    /* ---------------- 4. Per-frame update ---------------- */
    function update(time) {
      uniforms.uTime.value = time;
      for (var i = 0; i < MAX_DROPS; i++) {
        var d = pendingDrops[i];
        if (d) dropData[i].set(d.x, d.y, d.r, d.s);
        else dropData[i].set(0, 0, 0, 0);
      }
      pendingDrops.length = 0;

      simMat.uniforms.uPrev.value = rtA.texture;
      renderer.setRenderTarget(rtB);
      renderer.render(simScene, simCam);
      renderer.setRenderTarget(null);
      var tmp = rtA; rtA = rtB; rtB = tmp;
      uniforms.uSim.value = rtA.texture;
    }

    function setCard(worldX, worldZ, lift) {
      uniforms.uCardP.value.set(worldX, worldZtoP(worldZ));
      uniforms.uCardLift.value = lift;
    }

    return {
      mesh: mesh,
      uniforms: uniforms,
      originZ: ORIGIN_Z,
      waterY: WATER_Y,
      update: update,
      stir: stir,
      drop: drop,
      release: release,
      dropAt: dropAt,
      setCard: setCard
    };
  }

  /* Camera that the water was art-directed for (low, across the pool). */
  function placeCamera(camera, aspect) {
    camera.aspect = aspect;
    camera.fov = aspect < 1 ? 50 : 36;
    camera.position.set(0, 1.35, 4.6);
    camera.lookAt(0, 0.55, -10);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  window.AvoraWater = { create: create, placeCamera: placeCamera };
})();
