/*
  Floating AVORA card.
  A slim two-sided metal card using the original AVORA front/back artwork as textures
  (front ratio 2496:1800; the back is fitted to the same face). Everything lives in
  `group`: float, tilt, pointer response and the spring-driven turn to the back.
  Exposes window.AvoraCard.create(renderer, scene, opts).
*/
(function () {
  "use strict";

  var CARD_LAYER = 1;

  /* Soft studio environment in the scene's own palette, for metal reflections */
  function makeEnvironment(renderer) {
    var c = document.createElement("canvas");
    c.width = 1024; c.height = 512;
    var g = c.getContext("2d");

    var sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0.00, "#d9cfbb");
    sky.addColorStop(0.30, "#ebe3d2");
    sky.addColorStop(0.49, "#f6efe0");   // horizon
    sky.addColorStop(0.52, "#cdbfa4");
    sky.addColorStop(0.75, "#a8977b");
    sky.addColorStop(1.00, "#7d6b55");   // bronze water below
    g.fillStyle = sky;
    g.fillRect(0, 0, 1024, 512);

    // soft champagne light sources (low sun behind, broad fill in front)
    function glow(x, y, rx, ry, color, a) {
      var rg = g.createRadialGradient(x, y, 0, x, y, rx);
      rg.addColorStop(0, color.replace("A", a));
      rg.addColorStop(1, color.replace("A", 0));
      g.save();
      g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
      g.fillStyle = rg;
      g.fillRect(x - rx, y - rx, rx * 2, rx * 2);
      g.restore();
    }
    // darker bronze flags so the brushed face has tonal variation
    g.fillStyle = "rgba(110, 92, 70, 0.55)";
    g.fillRect(0, 140, 180, 200);
    g.fillRect(560, 150, 150, 190);
    glow(256, 240, 260, 90, "rgba(252,232,176,A)", 0.95);  // low sun side
    glow(820, 190, 220, 130, "rgba(255,250,238,A)", 0.95); // camera-side softbox
    glow(512, 110, 380, 70, "rgba(245,240,229,A)", 0.6);   // overhead strip
    g.fillStyle = "rgba(255, 249, 236, 0.85)";             // hard strip light → edge glint
    g.fillRect(380, 60, 26, 300);

    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.encoding = THREE.sRGBEncoding;
    var pmrem = new THREE.PMREMGenerator(renderer);
    var env = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    pmrem.dispose();
    return env;
  }

  function roundedRect(w, h, r) {
    var s = new THREE.Shape();
    var x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  /* Load the AVORA artwork. From disk (file://) browsers block WebGL from reading
     local image files, so the same PNGs are read from a data-URI copy instead. */
  function loadArtwork(base, done) {
    var loader = new THREE.TextureLoader();
    function load(front, back) {
      var out = {}, pending = 2;
      function got(key) { return function (tex) { out[key] = tex; if (--pending === 0) done(out); }; }
      function fail(err) { console.error("AVORA artwork failed to load", err); }
      loader.load(front, got("front"), undefined, fail);
      loader.load(back, got("back"), undefined, fail);
    }
    if (location.protocol === "file:") {
      var sc = document.createElement("script");
      sc.src = base + "avora-textures.js?v=7";
      sc.onload = function () { load(window.AVORA_TEXTURES.front, window.AVORA_TEXTURES.back); };
      sc.onerror = function () { console.error("Could not load " + sc.src); };
      document.head.appendChild(sc);
    } else {
      load(base + "avora-front.png?v=7", base + "avora-back.png?v=7");
    }
  }

  function faceGeometry(w, h, r) {
    var g = new THREE.ShapeGeometry(roundedRect(w, h, r), 24);
    var pos = g.attributes.position, uv = g.attributes.uv;
    for (var i = 0; i < uv.count; i++) {
      // the whole artwork spans the face: no crop, no offset
      uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
    }
    return g;
  }

  function create(renderer, scene, opts) {
    opts = opts || {};
    var HEIGHT = opts.height || 2.3;            // portrait: long side vertical
    var RATIO = 1477 / 1065;                    // AVORA artwork (h / w), same for front and back
    var WIDTH = HEIGHT / RATIO;
    var RADIUS = WIDTH * 0.064;                 // artwork corners measure 0.061 W; a hair larger trims the front's black corners
    var THICK = 0.016;                          // slim metal card
    var BEVEL = 0.004;
    var BASE = new THREE.Vector3(0, opts.y || 1.6, opts.z || -4.2);
    var assetBase = opts.assetBase || "./src/assets/";

    scene.environment = makeEnvironment(renderer);

    /* Body: thin metal edge, slightly inset so the faces cover it exactly */
    var edgeGeo = new THREE.ExtrudeGeometry(roundedRect(WIDTH - BEVEL * 2, HEIGHT - BEVEL * 2, RADIUS - BEVEL), {
      depth: THICK,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: 3,
      curveSegments: 24
    });
    edgeGeo.translate(0, 0, -THICK / 2);
    var edge = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xb8babd).convertSRGBToLinear(),   // the artwork's brushed-silver frame
      metalness: 1.0,
      roughness: 0.22,
      envMapIntensity: 1.3
    });

    /* Faces: the artwork drives colour directly (emissive) so it stays true to the file;
       a little diffuse + clearcoat lets the scene light move across it like real metal. */
    function faceMaterial() {
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0.06, 0.06, 0.06),
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.97,
        roughness: 0.45,
        metalness: 0.0,
        clearcoat: 0.45,
        clearcoatRoughness: 0.2,
        reflectivity: 0.2,          // low base reflection keeps the artwork's blacks deep
        envMapIntensity: 0.1,
        toneMapped: false
      });
    }
    var frontMat = faceMaterial();
    var backMat = faceMaterial();
    [frontMat, backMat].forEach(function (m) { m.emissive.setRGB(0.14, 0.145, 0.155); }); // until artwork arrives

    var faceZ = THICK / 2 + BEVEL + 0.0006;
    var faceGeo = faceGeometry(WIDTH, HEIGHT, RADIUS);
    var front = new THREE.Mesh(faceGeo, frontMat);
    front.position.z = faceZ;
    var back = new THREE.Mesh(faceGeo, backMat);
    back.position.z = -faceZ;
    back.rotation.y = Math.PI;                 // reads correctly when the card turns over

    var edgeMesh = new THREE.Mesh(edgeGeo, [edge, edge]);

    var body = new THREE.Group();
    body.add(edgeMesh, front, back);
    body.traverse(function (o) { o.layers.set(CARD_LAYER); });

    var group = new THREE.Group();
    group.rotation.order = "ZXY";              // lean (z) and tilt (x) stay in world space while the card spins
    group.add(body);
    group.userData.body = body;
    group.position.copy(BASE);
    scene.add(group);

    loadArtwork(assetBase, function (tex) {
      var aniso = renderer.capabilities.getMaxAnisotropy();
      [[tex.front, frontMat], [tex.back, backMat]].forEach(function (pair) {
        var t = pair[0], m = pair[1];
        t.encoding = THREE.sRGBEncoding;
        t.anisotropy = aniso;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.needsUpdate = true;
        m.map = t;
        m.emissiveMap = t;
        m.emissive.setRGB(1, 1, 1);
        m.needsUpdate = true;
      });
    });

    // lights only matter for the card; the water shader is self-lit
    var key = new THREE.DirectionalLight(0xfff3dc, 1.6);
    key.position.set(-2.5, 3.5, 7);
    var rim = new THREE.DirectionalLight(0xfce8b0, 1.2);
    rim.position.set(1.5, 1.2, -9);   // the low sun behind the card
    var fill = new THREE.HemisphereLight(0xf5f0e5, 0x8d7961, 0.35);
    [key, rim, fill].forEach(function (l) { l.layers.enableAll(); scene.add(l); });

    /* Motion: slow float, small breathing tilt, eased response to the pointer,
       plus a spring-driven turn to reveal the back. */
    var rest = { rx: -0.05, ry: -0.42, rz: -0.08 };  // ry: face turned to the left (≈ 24°); rz: in-plane lean (≈ 4.5°)
    var target = new THREE.Vector2(0, 0);
    var follow = new THREE.Vector2(0, 0);
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var flip = { angle: 0, vel: 0, target: 0, idle: 0 };
    var FLIP_K = 7.5;                          // spring stiffness
    var FLIP_C = 2 * Math.sqrt(FLIP_K) * 0.82; // slightly under-damped: a soft settle, no wobble
    var AUTO_RETURN = 6;                       // seconds on the back before turning home

    function setPointer(nx, ny) { target.set(nx, ny); }

    function toggle() {
      flip.target = flip.target === 0 ? Math.PI : 0;
      flip.idle = 0;
    }
    function showFront() { flip.target = 0; }
    function isFlipped() { return flip.target !== 0; }

    function stepFlip(dt) {
      if (reduce) { flip.angle = flip.target; flip.vel = 0; return; }
      var steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      var h = dt / steps;
      for (var i = 0; i < steps; i++) {
        var acc = FLIP_K * (flip.target - flip.angle) - FLIP_C * flip.vel;
        flip.vel += acc * h;
        flip.angle += flip.vel * h;
      }
      if (flip.target !== 0) {
        flip.idle += dt;
        if (flip.idle > AUTO_RETURN) flip.target = 0;
      }
    }

    function update(dt, t) {
      var k = 1 - Math.exp(-dt * 2.2);
      follow.x += (target.x - follow.x) * k;
      follow.y += (target.y - follow.y) * k;

      stepFlip(dt);
      // 0 → 1 → 0 across a turn: lift and tip the card a touch while it rotates
      var turning = Math.sin(Math.min(Math.max(flip.angle / Math.PI, 0), 1) * Math.PI);

      var m = reduce ? 0.2 : 1;
      var bob = Math.sin(t * 0.62) * 0.07 + Math.sin(t * 0.27 + 1.3) * 0.03;
      group.position.set(
        BASE.x + follow.x * 0.06,
        BASE.y + bob * m + follow.y * 0.04 + turning * 0.08,
        BASE.z
      );
      group.rotation.set(
        rest.rx + Math.sin(t * 0.41) * 0.025 * m - follow.y * 0.07 - turning * 0.05,
        rest.ry + Math.sin(t * 0.33 + 0.7) * 0.045 * m + follow.x * 0.16 + flip.angle,
        rest.rz + Math.sin(t * 0.52 + 2.1) * 0.018 * m
      );
    }

    var pickables = [front, back, edgeMesh];
    function hit(raycaster) {
      if (raycaster.layers) raycaster.layers.enableAll();
      return raycaster.intersectObjects(pickables, false).length > 0;
    }

    var bounds = new THREE.Box3();
    function lift(waterY) {
      // height of the card's lowest point (after tilt) above the water, for the contact shadow
      bounds.setFromObject(group);
      return Math.max(0.05, bounds.min.y - (waterY || 0));
    }

    return {
      group: group, layer: CARD_LAYER, base: BASE, rest: rest,
      update: update, setPointer: setPointer, lift: lift,
      hit: hit, toggle: toggle, showFront: showFront, isFlipped: isFlipped
    };
  }

  window.AvoraCard = { create: create, LAYER: CARD_LAYER };
})();
