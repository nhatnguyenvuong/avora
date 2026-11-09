/*
  AVORA wallet — Section 3 destination (still a placeholder model, but built to read
  as a physical object): a vertical graphite leather card sleeve.
    · back panel + shorter front pocket with a thumb notch at the mouth (the slot)
    · pebble-grain leather (bump + roughness), dark painted edges
    · dashed stitching around both panels and along the pocket mouth
    · AVORA mark debossed into the pocket
  The front pocket is hinged at its bottom edge so the mouth can respond to the card.
  Exposes window.AvoraWallet.create(scene, opts).
*/
(function () {
  "use strict";

  var W = 1.98;            // the card is 1.658 × 2.3
  var BACK_H = 2.75;
  var FRONT_H = 2.36;      // pocket mouth sits 0.39 below the top of the back panel
  var BACK_T = 0.05;
  var FRONT_T = 0.04;
  var RADIUS = 0.16;
  var NOTCH = 0.24;        // thumb notch radius at the pocket mouth
  var POCKET_Z = BACK_T / 2 + 0.02;
  var FRONT_Z = POCKET_Z + 0.02 + FRONT_T / 2;

  var MARK = [
    "M143.159 198.931C143.159 198.931 215.04 117.636 297.795 142.094C364.641 161.85 418 249.117 418 249.117C418 249.117 372 249.117 341.89 249.117C256.72 118.529 143.159 198.931 143.159 198.931Z",
    "M351.555 151.768C351.555 151.768 313.5 113.675 257.928 113.675C202.355 113.675 170.945 151.336 149.199 177.768C123.829 208.605 71.2775 249.117 0 249.117C78.526 171.722 152.124 0 210.812 0C269.5 0 297.795 79.227 351.555 151.768Z"
  ];

  function roundedRect(w, h, r) {
    var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  // pocket outline: rounded rectangle whose top edge dips into a thumb notch
  function pocketShape(w, h, r, n) {
    var s = new THREE.Shape(), x = -w / 2, y = -h / 2, top = y + h;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, top - r); s.quadraticCurveTo(x + w, top, x + w - r, top);
    s.lineTo(n, top);
    s.absarc(0, top, n, 0, Math.PI, true);          // the notch, curving down into the pocket
    s.lineTo(x + r, top); s.quadraticCurveTo(x, top, x, top - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  function extrude(shape, w, h, t) {
    var g = new THREE.ExtrudeGeometry(shape, {
      depth: t - 0.016, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008,
      bevelSegments: 3, curveSegments: 20
    });
    g.translate(0, 0, -(t - 0.016) / 2);
    var pos = g.attributes.position, uv = g.attributes.uv;
    for (var i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
    return g;
  }

  /* pebble-grain leather: soft irregular bumps */
  function pebbleCanvas(size) {
    var c = document.createElement("canvas"); c.width = c.height = size;
    var g = c.getContext("2d");
    g.fillStyle = "rgb(118,118,118)"; g.fillRect(0, 0, size, size);
    for (var i = 0; i < size * 9; i++) {
      var x = Math.random() * size, y = Math.random() * size, r = 1.2 + Math.random() * 3.2;
      var v = 125 + Math.random() * 60;
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(" + v + "," + v + "," + v + ",0.9)");
      gr.addColorStop(1, "rgba(" + v + "," + v + "," + v + ",0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  /* pocket surface map: pebble grain + the debossed AVORA mark */
  function pocketMaps(grainCanvas) {
    var size = 1024;
    var c = document.createElement("canvas"); c.width = size; c.height = Math.round(size * FRONT_H / W);
    var g = c.getContext("2d");
    var pat = g.createPattern(grainCanvas, "repeat");
    g.fillStyle = pat; g.fillRect(0, 0, c.width, c.height);
    // deboss: mark pressed in (darker = lower), centred in the lower half of the pocket
    var markW = size * 0.2, scale = markW / 418;
    g.save();
    g.translate(size / 2 - markW / 2, c.height * 0.64);
    g.scale(scale, scale);
    g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 6;
    g.fillStyle = "rgb(40,40,40)";
    MARK.forEach(function (d) { g.fill(new Path2D(d)); });
    g.restore();
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    return t;
  }

  function stitchLine(points, z, mat) {
    var g = new THREE.BufferGeometry().setFromPoints(points.map(function (p) { return new THREE.Vector3(p.x, p.y, z); }));
    var l = new THREE.Line(g, mat); l.computeLineDistances(); return l;
  }

  function create(scene, opts) {
    opts = opts || {};
    var clip = opts.waterY != null ? [new THREE.Plane(new THREE.Vector3(0, 1, 0), -opts.waterY)] : null;

    var grainCanvas = pebbleCanvas(256);
    var grain = new THREE.CanvasTexture(grainCanvas);
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set(4, 5.5);

    var leather = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1c1d1f).convertSRGBToLinear(),
      roughness: 0.68, roughnessMap: grain, metalness: 0,
      bumpMap: grain, bumpScale: 0.006, envMapIntensity: 0.22
    });
    var pocketMap = pocketMaps(grainCanvas);
    var pocketLeather = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x202124).convertSRGBToLinear(),
      roughness: 0.66, roughnessMap: pocketMap, metalness: 0,
      bumpMap: pocketMap, bumpScale: 0.01, envMapIntensity: 0.22
    });
    var edgePaint = new THREE.MeshStandardMaterial({     // glossy painted edge
      color: new THREE.Color(0x0e0e0f).convertSRGBToLinear(),
      roughness: 0.35, metalness: 0, envMapIntensity: 0.5
    });
    var lining = new THREE.MeshStandardMaterial({         // suede inside, seen through the mouth
      color: new THREE.Color(0x121213).convertSRGBToLinear(), roughness: 0.95, metalness: 0
    });
    var stitchMat = new THREE.LineDashedMaterial({
      color: 0x8c8e91, dashSize: 0.04, gapSize: 0.028, transparent: true, opacity: 0.8
    });
    if (clip) [leather, pocketLeather, edgePaint, lining, stitchMat].forEach(function (m) { m.clippingPlanes = clip; });

    var group = new THREE.Group();
    var body = new THREE.Group();
    group.add(body);

    var back = new THREE.Mesh(extrude(roundedRect(W - 0.016, BACK_H - 0.016, RADIUS - 0.008), W, BACK_H, BACK_T), [leather, edgePaint]);
    body.add(back);
    var liningMesh = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(W - 0.14, BACK_H - 0.16, RADIUS - 0.06), 12), lining);
    liningMesh.position.z = BACK_T / 2 + 0.002;
    body.add(liningMesh);
    body.add(stitchLine(roundedRect(W - 0.13, BACK_H - 0.13, RADIUS - 0.065).getPoints(30), BACK_T / 2 + 0.004, stitchMat));

    var hinge = new THREE.Group();
    hinge.position.set(0, -BACK_H / 2, FRONT_Z);
    var front = new THREE.Mesh(extrude(pocketShape(W - 0.016, FRONT_H - 0.016, RADIUS - 0.008, NOTCH), W, FRONT_H, FRONT_T), [pocketLeather, edgePaint]);
    front.position.y = FRONT_H / 2;
    hinge.add(front);
    var fz = FRONT_T / 2 + 0.003;
    // stitching: sides + bottom, and a line following the mouth and notch
    var sx = W / 2 - 0.065, by = -FRONT_H / 2 + 0.065, ty = FRONT_H / 2 - 0.07, r = RADIUS - 0.065;
    var outline = new THREE.Path();
    outline.moveTo(-sx, ty); outline.lineTo(-sx, by + r); outline.quadraticCurveTo(-sx, by, -sx + r, by);
    outline.lineTo(sx - r, by); outline.quadraticCurveTo(sx, by, sx, by + r); outline.lineTo(sx, ty);
    var sideStitch = stitchLine(outline.getPoints(20), fz, stitchMat); sideStitch.position.y = FRONT_H / 2;
    hinge.add(sideStitch);
    var mouth = new THREE.Path();
    // follows the notch 0.07 inside its edge; the arc meets the straight runs exactly
    var mr = NOTCH + 0.07, ma = Math.asin(0.07 / mr);
    mouth.moveTo(-sx, ty); mouth.lineTo(-mr * Math.cos(ma), ty);
    mouth.absarc(0, ty + 0.07, mr, Math.PI + ma, 2 * Math.PI - ma, false);
    mouth.lineTo(sx, ty);
    var mouthStitch = stitchLine(mouth.getPoints(40), fz, stitchMat); mouthStitch.position.y = FRONT_H / 2;
    hinge.add(mouthStitch);
    group.add(hinge);

    /* Seat light (Section 3): a restrained champagne glow where the card meets the slot.
       Both pieces are additive and start at 0, so the wallet itself looks exactly as before.
       · slotGlow — soft light on the card face just above the mouth (in front of the card,
         behind the front pocket, so the pocket hides its lower half)
       · rimGlow  — a thin warm line along the pocket mouth and notch, brightest at the centre */
    var GOLD = new THREE.Color(0xfce8b0);
    var mouthY = -BACK_H / 2 + FRONT_H;
    var slotMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: GOLD }, uOpacity: { value: 0 } },
      vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 uColor; uniform float uOpacity; varying vec2 vP;" +
        "void main(){ float g = exp(-(vP.x*vP.x/0.16 + vP.y*vP.y/0.03)); gl_FragColor = vec4(uColor * g * uOpacity * 0.55, 1.0); }",
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    });
    var slotGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), slotMat);
    slotGlow.position.set(0, mouthY, POCKET_Z + 0.0175);
    group.add(slotGlow);

    var rimMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: GOLD }, uOpacity: { value: 0 } },
      vertexShader: "attribute float aEdge; varying float vE; varying float vX; void main(){ vE = aEdge; vX = position.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 uColor; uniform float uOpacity; varying float vE; varying float vX;" +
        "void main(){ float g = (0.25 + 0.75 * exp(-vX*vX/0.18)) * pow(1.0 - vE, 2.0); gl_FragColor = vec4(uColor * g * uOpacity * 0.9, 1.0); }",
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
    });
    // ribbon just inside the mouth edge (hinge space): straight runs + the notch
    var rimEdge = new THREE.Path(), rx = W / 2 - 0.03, top = FRONT_H - 0.008;
    rimEdge.moveTo(-rx, top); rimEdge.lineTo(-NOTCH, top);
    rimEdge.absarc(0, top, NOTCH, Math.PI, 2 * Math.PI, false);
    rimEdge.lineTo(rx, top);
    var rp = rimEdge.getSpacedPoints(160), RIM_W = 0.05, rimPos = [], rimE = [], rimIdx = [];
    for (var i = 0; i < rp.length; i++) {
      var a = rp[Math.max(0, i - 1)], b = rp[Math.min(rp.length - 1, i + 1)];
      var tx = b.x - a.x, ty2 = b.y - a.y, tl = Math.hypot(tx, ty2) || 1;
      var nx = ty2 / tl, ny = -tx / tl;                      // points into the leather (down / inward)
      rimPos.push(rp[i].x, rp[i].y, 0, rp[i].x + nx * RIM_W, rp[i].y + ny * RIM_W, 0);
      rimE.push(0, 1);
      if (i < rp.length - 1) { var k = i * 2; rimIdx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    var rimGeo = new THREE.BufferGeometry();
    rimGeo.setAttribute("position", new THREE.Float32BufferAttribute(rimPos, 3));
    rimGeo.setAttribute("aEdge", new THREE.Float32BufferAttribute(rimE, 1));
    rimGeo.setIndex(rimIdx);
    var rimGlow = new THREE.Mesh(rimGeo, rimMat);
    rimGlow.position.z = FRONT_T / 2 + 0.005;
    hinge.add(rimGlow);
    slotGlow.visible = rimGlow.visible = false;

    if (opts.layer != null) group.traverse(function (o) { o.layers.set(opts.layer); });

    group.rotation.set(opts.rotX != null ? opts.rotX : -0.1, opts.rotY || 0, 0);
    if (opts.position) group.position.copy(opts.position);
    scene.add(group);

    function setOpen(angle) { hinge.rotation.x = angle; }   // + tips the pocket mouth outward
    function setGlow(v, slot) {                              // 0 → 1: the seat light (slot: card-face light, defaults to v)
      var sv = slot != null ? slot : v;
      slotMat.uniforms.uOpacity.value = sv;
      rimMat.uniforms.uOpacity.value = v;
      slotGlow.visible = sv > 0.002;
      rimGlow.visible = v > 0.002;
    }
    var tmp = new THREE.Vector3();
    function pocketPoint(localY, out) {
      group.updateMatrixWorld(true);
      return (out || tmp).set(0, localY, POCKET_Z).applyMatrix4(group.matrixWorld);
    }
    return {
      group: group,
      setOpen: setOpen,
      setGlow: setGlow,
      pocketPoint: pocketPoint,
      // card centre when fully inside: its top a little below the mouth (visible in the notch)
      insideY: mouthY - 0.07 - 1.15,
      // card centre when seated in the sleeve with its top part showing above the mouth
      seatedY: function (showing) { return mouthY + showing - 1.15; },
      bottomY: -BACK_H / 2,
      // card centre just above the mouth, ready to slide in
      aboveY: mouthY + 1.15 + 0.32,
      height: BACK_H, width: W
    };
  }

  window.AvoraWallet = { create: create };
})();
