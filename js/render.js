'use strict';

/* Three.js renderer.  The simulation still works in flat 2D coordinates, so the
   renderer maps sim x -> world X and sim y -> world Z and yaws every car by
   -heading around the Y axis. */

var Scene3D = (function () {
  var BG = 0x0b0f14;
  var ROAD_TOP = 0.3;

  var COL = {
    road: 0x2f3640,
    box: 0x333b46,
    edge: 0x6b7683,
    mark: 0xd9b038,
    stopLine: 0x9aa5b1,
    pole: 0x59626e
  };

  // the three lenses of a signal head, from top to bottom
  var LENS = [
    { off: 0x701818, on: 0xff3b30 },
    { off: 0x6b5510, on: 0xffc233 },
    { off: 0x12521f, on: 0x2ee06a }
  ];

  // height of the centre of the lens stack
  var HOOD_Y = 24.5;

  // chase camera: distance behind the car, how high it sits, how far ahead
  // of the car it looks, and how long the move in and out takes
  var FOLLOW_DIST = 50;
  var FOLLOW_EL = 0.36;
  var FOLLOW_AHEAD = 2;
  var FOLLOW_IN = 1.2;
  var FOLLOW_OUT = 1.0;

  // merge a list of geometries into one buffer with one draw group each
  function mergeParts(list) {
    var total = 0, i, g;
    var flat = [];
    for (i = 0; i < list.length; i++) {
      g = list[i].index ? list[i].toNonIndexed() : list[i];
      flat.push(g);
      total += g.attributes.position.count;
    }
    var pos = new Float32Array(total * 3);
    var nrm = new Float32Array(total * 3);
    var uv = new Float32Array(total * 2);
    var geo = new THREE.BufferGeometry();
    var off = 0;
    for (i = 0; i < flat.length; i++) {
      g = flat[i];
      pos.set(g.attributes.position.array, off * 3);
      nrm.set(g.attributes.normal.array, off * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, off * 2);
      geo.addGroup(off, g.attributes.position.count, i);
      off += g.attributes.position.count;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }

  // where the head of one approach stands and which way it looks: past the
  // junction, on the right hand side of the driver, facing back at them
  function headSpot(node, lane, side) {
    var t = DIRS[lane.dir];
    var r = { x: -t.y, y: t.x };
    return {
      x: node.x + t.x * 25 + r.x * 23,
      z: node.y + t.y * 25 + r.y * 23,
      ang: Math.atan2(-t.x, -t.y),
      axis: isVertical(lane.dir) ? 'V' : 'H',
      side: side
    };
  }

  /* ---------------------------------------------------------------- cars
     Every model keeps the same footprint but has its own silhouette: the
     body is a box whose top is pulled in, the greenhouse sits on top of it
     and the lights are small coloured blocks. */

  function taperedBox(len, h, w, topX, topZ) {
    var g = new THREE.BoxGeometry(len, h, w);
    var p = g.attributes.position;
    for (var i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) {
        p.setX(i, p.getX(i) * topX);
        p.setZ(i, p.getZ(i) * topZ);
      }
    }
    g.computeVertexNormals();
    return g;
  }

  // merge coloured parts into one geometry with a single draw group
  function mergeColored(parts) {
    var total = 0, i, v, g;
    var flat = [];
    var allUv = true;
    for (i = 0; i < parts.length; i++) {
      g = parts[i].geo.index ? parts[i].geo.toNonIndexed() : parts[i].geo;
      flat.push(g);
      total += g.attributes.position.count;
      if (!g.attributes.uv) allUv = false;
    }
    var pos = new Float32Array(total * 3);
    var nrm = new Float32Array(total * 3);
    var col = new Float32Array(total * 3);
    // the texture coordinates are only kept when every part has them, the
    // shaders that need them are only used on such a merge
    var uv = allUv ? new Float32Array(total * 2) : null;
    var off = 0;
    for (i = 0; i < flat.length; i++) {
      g = flat[i];
      pos.set(g.attributes.position.array, off * 3);
      nrm.set(g.attributes.normal.array, off * 3);
      if (uv) uv.set(g.attributes.uv.array, off * 2);
      var c = parts[i].color;
      for (v = 0; v < g.attributes.position.count; v++) {
        col[(off + v) * 3] = c[0];
        col[(off + v) * 3 + 1] = c[1];
        col[(off + v) * 3 + 2] = c[2];
      }
      off += g.attributes.position.count;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.addGroup(0, total, 0);
    return geo;
  }

  function rgb(hex) {
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  }

  // a random generator with a fixed seed, so the plants stay where they were
  // put when the map is rebuilt
  function seeded(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  var GREENERY = {
    lawn: 0x1e3326,
    patch: [0x27452f, 0x2c4d33, 0x22402b, 0x30543a],
    path: 0x605e53,
    kerb: 0x50503f,
    plaza: 0x6e6b5d,
    shore: 0x555b4d,
    water: 0x1c3b4c,
    grass: [0x3f8049, 0x4d9552, 0x2f6a3c],
    bush: [0x2f6039, 0x3a7040, 0x27512f],
    trunk: 0x4a3a2a,
    leaf: [0x2c5734, 0x356639, 0x3f7440],
    leafWarm: [0x8a5a24, 0xa8701f, 0x9c6a1f],   // the trees in autumn
    blossom: [0xe8a8c0, 0xf2c4d6, 0xd894b4],    // the cherry trees
    planter: 0x8d8577,
    stem: 0x3a7a42,
    petal: [0xf0efe4, 0xef7f9c, 0xf3c23c, 0xb58cf0, 0xee7a42, 0xe6dcff],
    stone: 0x7c7a70,
    wood: 0x6b4a32,
    metal: 0x39414c,
    lamp: 0xffe6a6
  };

  /* The empty blocks between the roads are little parks: a lawn of grass
     patches, a gravel path, a pond, trees, bushes and flowers.  Nothing
     grows above the height of the traffic, so it never gets in the way.
     Two of the blocks are different: one turns into a beach with a game of
     volleyball, the other into a fairground with rides. */
  function blockScenery() {
    var parts = [];
    var meshes = [];
    var actors = [];
    var blocks = [];
    var rnd = seeded(20261118);
    var half = CFG.ROAD_W / 2 + 4;

    function add(geo, hex) { parts.push({ geo: geo, color: rgb(hex) }); }
    function box(x, y, z, w, h, d, hex) {
      var g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      add(g, hex);
    }
    function disc(cx, cz, rx, rz, y, hex) {
      var g = new THREE.CircleGeometry(1, 18);
      g.scale(rx, rz, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(cx, y, cz);
      add(g, hex);
    }
    function blob(cx, cy, cz, r, hex, squash) {
      var g = new THREE.IcosahedronGeometry(r, 0);
      g.scale(1, squash || 1, 1);
      g.translate(cx, cy, cz);
      add(g, hex);
    }
    function tree(x, z, scale) {
      var th = 5.2 * scale;
      var trunk = new THREE.CylinderGeometry(0.8 * scale, 1.6 * scale, th, 8);
      trunk.translate(x, 0.4 + th / 2, z);
      add(trunk, GREENERY.trunk);
      // two branches reaching out of the trunk
      for (var b = 0; b < 2; b++) {
        var ba = rnd() * Math.PI * 2;
        var branch = new THREE.CylinderGeometry(0.3 * scale, 0.55 * scale, 3.6 * scale, 6);
        branch.rotateZ(0.55);
        branch.rotateY(ba);
        branch.translate(x + Math.cos(ba) * 1.5 * scale, 0.4 + th + 0.4 * scale,
          z + Math.sin(ba) * 1.5 * scale);
        add(branch, GREENERY.trunk);
      }
      // every tree is in season of its own: most are green, a few are in
      // autumn and a couple are cherry trees
      var pick = rnd();
      var leaves = GREENERY.leaf;
      if (pick > 0.79) leaves = GREENERY.leafWarm;
      else if (pick > 0.69) leaves = GREENERY.blossom;
      // the crown, in layers, the widest one at the bottom
      var top = 12 * scale;
      for (var i = 0; i < 5; i++) {
        var r = (4.8 - i * 0.62) * scale;
        blob(x + (rnd() - 0.5) * 2.4 * scale, top - r * 0.85 - i * 0.95 * scale,
          z + (rnd() - 0.5) * 2.4 * scale, r,
          leaves[(rnd() * leaves.length) | 0], 0.78);
      }
    }

    // a raised bed of flowers
    function flowerBed(cx, cz, w, d) {
      var soil = new THREE.BoxGeometry(w - 1.6, 0.5, d - 1.6);
      soil.translate(cx, 0.55, cz);
      add(soil, GREENERY.trunk);
      // the stone rim around it
      var rim = 0.7;
      box(cx, 0.75, cz - d / 2 + rim / 2, w, 0.7, rim, GREENERY.planter);
      box(cx, 0.75, cz + d / 2 - rim / 2, w, 0.7, rim, GREENERY.planter);
      box(cx - w / 2 + rim / 2, 0.75, cz, rim, 0.7, d - rim * 2, GREENERY.planter);
      box(cx + w / 2 - rim / 2, 0.75, cz, rim, 0.7, d - rim * 2, GREENERY.planter);
      var n = Math.max(5, Math.round(w * d / 42));
      for (var i = 0; i < n; i++) {
        flower(cx + (rnd() - 0.5) * (w - 3), cz + (rnd() - 0.5) * (d - 3));
      }
    }
    function tuft(x, z) {
      for (var b = 0; b < 3; b++) {
        var h = 1.8 + rnd() * 1.5;
        var blade = new THREE.ConeGeometry(1, h, 5);
        blade.translate(x + (rnd() - 0.5) * 2.6, 0.4 + h / 2, z + (rnd() - 0.5) * 2.6);
        add(blade, GREENERY.grass[(rnd() * GREENERY.grass.length) | 0]);
      }
    }
    function flower(x, z) {
      var h = 1.4 + rnd() * 0.8;
      var stem = new THREE.BoxGeometry(0.45, h, 0.45);
      stem.translate(x, 0.4 + h / 2, z);
      add(stem, GREENERY.stem);
      blob(x, 0.4 + h + 0.5, z, 0.85 + rnd() * 0.4,
        GREENERY.petal[(rnd() * GREENERY.petal.length) | 0]);
    }
    function bench(x, z, ang) {
      var seat = new THREE.BoxGeometry(7, 0.7, 2.6);
      seat.rotateY(ang);
      seat.translate(x, 2.1, z);
      add(seat, GREENERY.wood);
      for (var i = 0; i < 2; i++) {
        var leg = new THREE.BoxGeometry(0.9, 1.8, 2.2);
        leg.rotateY(ang);
        leg.translate(x + Math.cos(ang) * (i ? 2.6 : -2.6), 1.3, z - Math.sin(ang) * (i ? 2.6 : -2.6));
        add(leg, GREENERY.metal);
      }
    }
    function lampPost(x, z) {
      var post = new THREE.CylinderGeometry(0.4, 0.55, 9.5, 6);
      post.translate(x, 5.15, z);
      add(post, GREENERY.metal);
      blob(x, 10.2, z, 1.1, GREENERY.lamp);
    }

    // one of the parks.  The two other blocks get something else.
    function park(x0, x1, y0, y1, c, r) {
      var w = x1 - x0, d = y1 - y0;
      var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      // every other park is mirrored, so the four of them do not look alike
      var flip = (c + r) % 2 ? -1 : 1;
      function mirrorX(v) { return mx + flip * (v - mx); }

      // the lawn, with patches of a different green on top of it
      box(mx, 0.15, my, w, 0.5, d, GREENERY.lawn);
      for (var p = 0; p < 6; p++) {
        // the patch has to fit on the lawn, or it would spill over the kerb
        // and paint the road green
        var prx = 10 + rnd() * 16, prz = 7 + rnd() * 9;
        var pcx = x0 + prx + 1 + rnd() * Math.max(1, w - prx * 2 - 2);
        var pcz = y0 + prz + 1 + rnd() * Math.max(1, d - prz * 2 - 2);
        disc(pcx, pcz, prx, prz, 0.42,
          GREENERY.patch[(rnd() * GREENERY.patch.length) | 0]);
      }

      // a gravel path across the park and a paved square where it crosses.
      // every layer has a height of its own, so no two of them end up on
      // the same plane and fight for the same pixels
      box(mx, 0.46, my, w - 8, 0.1, 11, GREENERY.path);
      box(mx, 0.45, my, 10, 0.1, d - 8, GREENERY.path);
      box(mx, 0.505, my, 26, 0.21, 26, GREENERY.plaza);

      // the pond in one corner
      var px = mirrorX(x0 + w * 0.22), pz = y0 + d * 0.24;
      disc(px, pz, 26, 16, 0.48, GREENERY.shore);
      disc(px, pz, 21, 12, 0.52, GREENERY.water);

      function inPond(x, z) {
        var dx = (x - px) / 29, dz = (z - pz) / 19;
        return dx * dx + dz * dz < 1;
      }

      // the paved parts of the park, where nothing grows
      function onWalk(x, z) {
        if (Math.abs(x - mx) < 13 && Math.abs(z - my) < 13) return true;
        if (Math.abs(z - my) < 6 && Math.abs(x - mx) < w / 2) return true;
        if (Math.abs(x - mx) < 6 && Math.abs(z - my) < d / 2) return true;
        return false;
      }

      tree(mirrorX(x0 + w * 0.74), y0 + d * 0.22, 1.05);
      tree(mirrorX(x0 + w * 0.78), y0 + d * 0.76, 0.92);
      tree(mirrorX(x0 + w * 0.30), y0 + d * 0.80, 1.15);

      // the bushes grow in clumps
      for (var u = 0; u < 7; u++) {
        var ux = x0 + 12 + rnd() * (w - 24), uy = y0 + 12 + rnd() * (d - 24);
        if (inPond(ux, uy) || onWalk(ux, uy)) continue;
        var clump = 2 + ((rnd() * 3) | 0);
        for (var cb = 0; cb < clump; cb++) {
          var bx2 = ux + (rnd() - 0.5) * 9, by2 = uy + (rnd() - 0.5) * 7;
          if (inPond(bx2, by2) || onWalk(bx2, by2)) continue;
          var rad = 1.8 + rnd() * 1.5;
          blob(bx2, 0.4 + rad * 0.6, by2, rad,
            GREENERY.bush[(rnd() * GREENERY.bush.length) | 0], 0.66);
        }
      }

      // two beds of flowers on the lawn
      for (var fb = 0; fb < 2; fb++) {
        var fbx = mirrorX(x0 + w * (fb ? 0.72 : 0.26)), fbz = y0 + d * (fb ? 0.36 : 0.60);
        if (inPond(fbx, fbz) || onWalk(fbx, fbz)) continue;
        flowerBed(fbx, fbz, 26, 16);
      }

      for (var t = 0; t < 18; t++) {
        var tx = x0 + 8 + rnd() * (w - 16), ty = y0 + 8 + rnd() * (d - 16);
        if (inPond(tx, ty) || onWalk(tx, ty)) continue;
        tuft(tx, ty);
      }

      // flowers grow in clumps
      for (var f = 0; f < 6; f++) {
        var fx = x0 + 12 + rnd() * (w - 24), fy = y0 + 12 + rnd() * (d - 24);
        if (inPond(fx, fy) || onWalk(fx, fy)) continue;
        var n = 3 + ((rnd() * 3) | 0);
        for (var k = 0; k < n; k++) {
          flower(fx + (rnd() - 0.5) * 9, fy + (rnd() - 0.5) * 7);
        }
      }

      for (var s = 0; s < 6; s++) {
        var sx = x0 + 8 + rnd() * (w - 16), sy = y0 + 8 + rnd() * (d - 16);
        if (inPond(sx, sy) || onWalk(sx, sy)) continue;
        blob(sx, 0.6, sy, 0.9 + rnd() * 0.5, GREENERY.stone, 0.7);
      }

      bench(mirrorX(x0 + w * 0.5 + 13), my - 9, Math.PI / 2);
      bench(mirrorX(mx - 13), y0 + d * 0.5, 0);
      lampPost(mx + 24, my);
      lampPost(mx - 24, my);
      lampPost(mirrorX(x0 + w * 0.5), y0 + d * 0.5 - 22);
    }

    // what the scenery needs from the renderer: the colour helper, the merge
    // helper and a random number generator
    var api = { rgb: rgb, merge: mergeColored, rnd: rnd };

    for (var c = 0; c < CFG.COLS - 1; c++) {
      for (var r = 0; r < CFG.ROWS - 1; r++) {
        var x0 = CFG.MARGIN_X + c * CFG.BLOCK_X + half;
        var x1 = CFG.MARGIN_X + (c + 1) * CFG.BLOCK_X - half;
        var y0 = CFG.MARGIN_Y + r * CFG.BLOCK_Y + half;
        var y1 = CFG.MARGIN_Y + (r + 1) * CFG.BLOCK_Y - half;
        blocks.push({ x0: x0, x1: x1, y0: y0, y1: y1 });

        var built = null;
        if (c === 0 && r === 0) built = Scenery.beach(api, x0, x1, y0, y1);
        else if (c === 1 && r === 1) built = Scenery.fair(api, x0, x1, y0, y1);
        else park(x0, x1, y0, y1, c, r);

        if (!built) continue;
        for (var p = 0; p < built.parts.length; p++) parts.push(built.parts[p]);
        for (var m = 0; m < built.meshes.length; m++) meshes.push(built.meshes[m]);
        actors.push(built);
      }
    }

    return { geo: mergeColored(parts), meshes: meshes, actors: actors, blocks: blocks };
  }

  /* ---------------------------------------------------------------- cars
     Every vehicle in the catalogue is built from a list of panels: the body
     takes the colour of the car, the trim keeps its own colour, and the
     lamps are lit separately. */

  var WHITE = [1, 1, 1];

  // one panel: a box whose top face can be pulled inwards and tilted back
  function slab(p) {
    var g = taperedBox(p[0], p[1], p[2],
      p[6] === undefined ? 1 : p[6],
      p[7] === undefined ? 1 : p[7]);
    if (p[8]) g.rotateZ(p[8]);
    g.translate(p[3], p[4], p[5]);
    return g;
  }

  // a tube: tanks, drums, exhaust stacks
  function tube(p) {
    var g = new THREE.CylinderGeometry(p[1], p[1], p[2], 14);
    if (p[6]) g.rotateZ(p[6]);
    if (p[7]) g.rotateX(p[7]);
    g.translate(p[3], p[4], p[5]);
    return g;
  }

  function buildCarModels() {
    var models = [];
    for (var i = 0; i < CAR_CATALOG.length; i++) {
      var entry = CAR_CATALOG[i];
      var spec = CAR_SHAPES[entry.key];
      if (!spec) continue;
      var bodyParts = [], glassParts = [], trimParts = [], lampParts = [], cylParts = [];
      var j, p;
      for (j = 0; j < spec.body.length; j++) bodyParts.push({ geo: slab(spec.body[j]), color: WHITE });
      for (j = 0; j < spec.glass.length; j++) glassParts.push({ geo: slab(spec.glass[j]), color: WHITE });
      for (j = 0; j < spec.trim.length; j++) {
        p = spec.trim[j];
        trimParts.push({ geo: slab(p.slice(1)), color: rgb(p[0]) });
      }
      for (j = 0; j < spec.lamps.length; j++) {
        p = spec.lamps[j];
        lampParts.push({ geo: slab(p.slice(1)), color: rgb(p[0]) });
      }
      for (j = 0; j < spec.cyl.length; j++) {
        p = spec.cyl[j];
        cylParts.push({ geo: tube(p), color: rgb(p[0]) });
      }
      var trimParts2 = trimParts.concat(cylParts);
      models.push({
        key: entry.key,
        label: entry.label,
        common: entry.common,
        len: entry.len,
        wid: entry.wid,
        wheelR: spec.wheelR,
        wheels: spec.wheels,
        body: mergeColored(bodyParts),
        glass: glassParts.length ? mergeColored(glassParts) : null,
        trim: trimParts2.length ? mergeColored(trimParts2) : null,
        lamps: mergeColored(lampParts)
      });
    }
    return models;
  }
  function create(canvas) {
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);

    var camera = new THREE.PerspectiveCamera(46, 1, 5, 4000);
    var WORLD_W = CFG.MARGIN_X * 2 + (CFG.COLS - 1) * CFG.BLOCK_X + CFG.STUB;
    var WORLD_H = CFG.MARGIN_Y * 2 + (CFG.ROWS - 1) * CFG.BLOCK_Y + CFG.STUB;
    var cam = { tx: WORLD_W / 2, ty: 0, tz: WORLD_H / 2, az: 0.72, el: 0.72, zoom: 1, r: 600 };

    // chase camera state: the car we follow, the smoothed heading it is seen
    // from, and the pose the camera is easing towards
    var follow = { car: null, leaving: false, angle: 0, ready: false };
    var camPose = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, init: false };
    var camAnim = { active: false, t: 0, dur: 1, from: null };
    var lookTarget = new THREE.Vector3();
    var carSlots = [];
    var carBodies = [];

    // distance needed to keep the whole map inside the frame
    function fitRadius() {
      if (!fitPts.length) return 600;
      var half = Math.tan(camera.fov * Math.PI / 360);
      var aspect = camera.aspect;
      var ce = Math.cos(cam.el), se = Math.sin(cam.el);
      var dx = -Math.sin(cam.az) * ce, dy = -se, dz = -Math.cos(cam.az) * ce;
      var rx = -dz, rz = dx;
      var rl = Math.hypot(rx, rz) || 1;
      rx /= rl; rz /= rl;
      var ux = -rz * dy, uy = rz * dx - rx * dz, uz = rx * dy;
      var need = 0;
      for (var i = 0; i < fitPts.length; i++) {
        var px = fitPts[i].x - cam.tx, py = fitPts[i].y, pz = fitPts[i].z - cam.tz;
        var x = px * rx + pz * rz;
        var y = px * ux + py * uy + pz * uz;
        var d = px * dx + py * dy + pz * dz;
        need = Math.max(need, Math.abs(y) / half - d, Math.abs(x) / (half * aspect) - d);
      }
      return Math.max(140, need * 1.06);
    }

    // pose of the map view
    function freePose() {
      cam.r = fitRadius() * cam.zoom;
      var ce = Math.cos(cam.el);
      return {
        px: cam.tx + Math.sin(cam.az) * ce * cam.r,
        py: cam.ty + Math.sin(cam.el) * cam.r,
        pz: cam.tz + Math.cos(cam.az) * ce * cam.r,
        tx: cam.tx, ty: cam.ty, tz: cam.tz
      };
    }

    // pose of the chase camera: behind the car, looking at its tail.  The
    // heading is smoothed so a turn swings the camera round instead of
    // snapping to the new direction.
    function followPose(dt) {
      var car = follow.car;
      var h = car.heading();
      if (!follow.ready) {
        follow.angle = h;
        follow.ready = true;
      } else {
        var d = h - follow.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        follow.angle += d * Math.min(1, dt * 4.5);
      }
      var p = car.pos();
      var dx = Math.cos(follow.angle), dz = Math.sin(follow.angle);
      var back = FOLLOW_DIST * Math.cos(FOLLOW_EL);
      return {
        px: p.x - dx * back,
        py: FOLLOW_DIST * Math.sin(FOLLOW_EL),
        pz: p.y - dz * back,
        tx: p.x + dx * FOLLOW_AHEAD,
        ty: 3.4,
        tz: p.y + dz * FOLLOW_AHEAD
      };
    }

    // start an eased move from where the camera is now to where it is going
    function startAnim(dur) {
      camAnim.from = {
        px: camPose.px, py: camPose.py, pz: camPose.pz,
        tx: camPose.tx, ty: camPose.ty, tz: camPose.tz
      };
      camAnim.t = 0;
      camAnim.dur = dur;
      camAnim.active = true;
    }

    function updateCamera(dt, sim) {
      var i;
      // the followed car has left the map: go back to the map view
      if (follow.car && !follow.leaving && sim) {
        var alive = false;
        for (i = 0; i < sim.cars.length; i++) {
          if (sim.cars[i] === follow.car) { alive = true; break; }
        }
        if (!alive) {
          follow.leaving = true;
          startAnim(FOLLOW_OUT);
        }
      }
      if (follow.leaving && !camAnim.active) {
        follow.car = null;
        follow.leaving = false;
        follow.ready = false;
      }

      var d = (follow.car && !follow.leaving) ? followPose(dt) : freePose();
      var px = d.px, py = d.py, pz = d.pz, tx = d.tx, ty = d.ty, tz = d.tz;

      if (camAnim.active) {
        camAnim.t = Math.min(1, camAnim.t + dt / camAnim.dur);
        var e = camAnim.t * camAnim.t * (3 - 2 * camAnim.t);
        px = camAnim.from.px + (px - camAnim.from.px) * e;
        py = camAnim.from.py + (py - camAnim.from.py) * e;
        pz = camAnim.from.pz + (pz - camAnim.from.pz) * e;
        tx = camAnim.from.tx + (tx - camAnim.from.tx) * e;
        ty = camAnim.from.ty + (ty - camAnim.from.ty) * e;
        tz = camAnim.from.tz + (tz - camAnim.from.tz) * e;
        if (camAnim.t >= 1) camAnim.active = false;
      }

      camPose.px = px; camPose.py = py; camPose.pz = pz;
      camPose.tx = tx; camPose.ty = ty; camPose.tz = tz;
      camPose.init = true;
      camera.position.set(px, py, pz);
      lookTarget.set(tx, ty, tz);
      camera.lookAt(lookTarget);
    }

    var amb = new THREE.AmbientLight(0xffffff, 0.18);
    var hemi = new THREE.HemisphereLight(0x9db4d6, 0x0b0f14, 0.3);
    scene.add(amb, hemi);
    // a soft light from the other side, so the walls of the houses do not
    // fall into the dark
    var fill = new THREE.DirectionalLight(0xbcd0f0, 0.16);
    fill.position.set(-260, 190, -220);
    scene.add(fill);

    // the lights of the city and the windows of the houses, they only show
    // when the sun is down
    var nightMode = false;
    var rainMode = false;
    var nightMeshes = [];
    var groundMat = null;
    var roadMat = null;
    var sky = Sky.create(scene);

    var sun = new THREE.DirectionalLight(0xffffff, 0.52);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -480;
    sun.shadow.camera.right = 480;
    sun.shadow.camera.top = 400;
    sun.shadow.camera.bottom = -400;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 1100;
    sun.shadow.bias = -0.0007;
    sun.shadow.normalBias = 0.05;
    scene.add(sun);
    scene.add(sun.target);

    // The shadow map only covers the piece of the map the camera looks at,
    // so the shadows stay sharp when the view is close to the ground.  The
    // sun keeps the same angle to the map, it only moves along with us.
    function updateShadow() {
      var dx = camPose.px - camPose.tx;
      var dy = camPose.py - camPose.ty;
      var dz = camPose.pz - camPose.tz;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var half = Math.tan(camera.fov * Math.PI / 360) * dist;
      var wide = half * camera.aspect;
      var ext = Math.min(520, Math.max(wide, half) * 1.8 + 30);
      sun.target.position.set(camPose.tx, 0, camPose.tz);
      sun.position.set(camPose.tx + 220, 330, camPose.tz + 170);
      var sc = sun.shadow.camera;
      sc.left = -ext;
      sc.right = ext;
      sc.top = ext;
      sc.bottom = -ext;
      sc.near = Math.max(1, 430 - ext * 1.6);
      sc.far = 430 + ext * 1.6;
      sc.updateProjectionMatrix();
    }

    var staticGroup = new THREE.Group();
    var lightGroup = new THREE.Group();
    var carGroup = new THREE.Group();
    scene.add(staticGroup, lightGroup, carGroup);

    // the rides of the fairground and the ball of the beach, moved every frame
    var sceneryActors = [];
    var sceneryMeshes = [];
    var sceneryClock = 0;

    var unitBox = new THREE.BoxGeometry(1, 1, 1);
    var pickables = [];
    var heads = [];
    var fitPts = [];

    var bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.08 });
    var glassMat = new THREE.MeshStandardMaterial({ color: 0x18222d, roughness: 0.22, metalness: 0.2 });
    var lightMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, emissive: 0x0f0f0f });
    var wheelMat = new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.9 });
    // the trim keeps the colour it was drawn with, so it is never tinted by
    // the colour of the car
    var trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });

    var carModels = buildCarModels();
    var modelByKey = {};
    for (var mi = 0; mi < carModels.length; mi++) {
      modelByKey[carModels[mi].key] = mi;
      carModels[mi].capacity = 0;
      carModels[mi].wheelGeo = new THREE.CylinderGeometry(
        carModels[mi].wheelR, carModels[mi].wheelR, carModels[mi].wheelR * 1.2, 12);
    }

    function modelIndex(key) {
      var i = modelByKey[key];
      return i === undefined ? 0 : i;
    }

    function instanced(geo, mat, count) {
      var m = new THREE.InstancedMesh(geo, mat, count);
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      carGroup.add(m);
      return m;
    }

    // every model keeps its own set of instances, grown when it runs full.
    // Models with no car on the map do not get any instances at all.
    function ensureCars(counts) {
      for (var i = 0; i < carModels.length; i++) {
        var m = carModels[i];
        var n = counts[i];
        if (!n) continue;
        if (m.bodyMesh && n <= m.capacity) continue;
        m.capacity = Math.max(n, m.capacity * 2, 8);
        if (m.bodyMesh) {
          var old = [m.bodyMesh, m.glassMesh, m.lightMesh, m.wheelMesh, m.trimMesh];
          for (var k = 0; k < old.length; k++) {
            if (!old[k]) continue;
            carGroup.remove(old[k]);
            if (old[k].dispose) old[k].dispose();
          }
        }
        m.bodyMesh = instanced(m.body, bodyMat, m.capacity);
        m.bodyMesh.userData.model = i;
        m.glassMesh = m.glass ? instanced(m.glass, glassMat, m.capacity) : null;
        m.lightMesh = instanced(m.lights, lightMat, m.capacity);
        m.wheelMesh = instanced(m.wheelGeo, wheelMat, m.capacity * m.wheels.length);
        m.trimMesh = m.trim ? instanced(m.trim, trimMat, m.capacity) : null;
      }
    }

    function disposeGroup(g) {
      for (var i = g.children.length - 1; i >= 0; i--) {
        var o = g.children[i];
        g.remove(o);
        if (o.geometry && o.geometry !== unitBox) o.geometry.dispose();
        if (!o.material) continue;
        if (o.material.dispose) o.material.dispose();
        else if (o.material.length) {
          for (var m = 0; m < o.material.length; m++) o.material[m].dispose();
        }
      }
    }

    // switch the map between day and night: the sun goes down, the sky goes
    // dark and the lights of the city come on
    function applyLight() {
      var dark = nightMode;
      var wet = rainMode;
      scene.background.set(dark ? 0x05070c : BG);
      sun.color.set(dark ? (wet ? 0x7f92b8 : 0x8ea6d6) : (wet ? 0xd8dee6 : 0xffffff));
      sun.intensity = dark ? (wet ? 0.16 : 0.26) : (wet ? 0.30 : 0.52);
      amb.intensity = dark ? (wet ? 0.09 : 0.11) : (wet ? 0.15 : 0.18);
      hemi.color.set(dark ? 0x27374f : (wet ? 0x8c97a4 : 0x9db4d6));
      hemi.intensity = dark ? 0.30 : (wet ? 0.34 : 0.30);
      fill.intensity = dark ? (wet ? 0.05 : 0.08) : (wet ? 0.10 : 0.16);
      if (groundMat) groundMat.color.set(dark ? 0x080b10 : (wet ? 0x0d1116 : 0x10151b));
      if (roadMat) {
        roadMat.roughness = wet ? 0.32 : 0.95;
        roadMat.metalness = wet ? 0.35 : 0;
      }
      if (scene.fog) scene.fog.color.setHex(dark ? 0x1a2230 : 0x6d7a88);
    }

    function setNight(v) {
      nightMode = !!v;
      sky.setNight(nightMode);
      applyLight();
      for (var i = 0; i < nightMeshes.length; i++) nightMeshes[i].visible = nightMode;
    }

    // the weather: rain dims the light and leaves the road wet
    function setRain(v) {
      rainMode = !!v;
      sky.setRain(rainMode);
      if (rainMode) {
        if (!scene.fog) scene.fog = new THREE.Fog(0x6d7a88, 420, 1250);
      } else {
        scene.fog = null;
      }
      applyLight();
    }

    function roadBand(x, z, ang, len, wide, mat, top) {
      var m = new THREE.Mesh(unitBox, mat);
      m.position.set(x, (top - ROAD_TOP) / 2, z);
      m.rotation.y = -ang;
      m.scale.set(len, top, wide);
      m.receiveShadow = true;
      staticGroup.add(m);
      return m;
    }

    function build(net) {
      disposeGroup(staticGroup);
      disposeGroup(lightGroup);
      // the scenery of the last build goes with it
      for (var sd = 0; sd < sceneryMeshes.length; sd++) {
        sceneryMeshes[sd].traverse(function (o) {
          if (!o.isMesh) return;
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
      }
      sceneryMeshes.length = 0;
      sceneryActors.length = 0;
      pickables.length = 0;
      heads.length = 0;

      var i, d;
      // one signal head per approach of every junction
      var spots = [];
      for (i = 0; i < net.nodes.length; i++) {
        var fn = net.nodes[i];
        var list = [];
        for (d = 0; d < 4; d++) {
          var fid = fn.in[d];
          if (!fid) continue;
          list.push(headSpot(fn, net.lanes[fid], d));
        }
        spots.push(list);
      }

      // the points the camera has to keep in frame: junctions, the ends of the
      // roads leaving the map and the tops of the signal heads
      fitPts.length = 0;
      var fx0 = Infinity, fx1 = -Infinity, fz0 = Infinity, fz1 = -Infinity;
      for (i = 0; i < net.nodes.length; i++) {
        var fn2 = net.nodes[i];
        fitPts.push({ x: fn2.x, y: 0, z: fn2.y });
        for (var s = 0; s < spots[i].length; s++) {
          fitPts.push({ x: spots[i][s].x, y: HOOD_Y + 11, z: spots[i][s].z });
        }
        for (d = 0; d < 4; d++) {
          if (net.laneFrom(fn2, d)) continue;
          var fv = DIRS[d];
          var ex = fn2.x + fv.x * CFG.STUB, ez = fn2.y + fv.y * CFG.STUB;
          fitPts.push({ x: ex, y: 0, z: ez });
          fitPts.push({ x: ex - fv.y * CFG.ROAD_W / 2, y: 0, z: ez + fv.x * CFG.ROAD_W / 2 });
          fitPts.push({ x: ex + fv.y * CFG.ROAD_W / 2, y: 0, z: ez - fv.x * CFG.ROAD_W / 2 });
        }
      }
      for (i = 0; i < fitPts.length; i++) {
        if (fitPts[i].x < fx0) fx0 = fitPts[i].x;
        if (fitPts[i].x > fx1) fx1 = fitPts[i].x;
        if (fitPts[i].z < fz0) fz0 = fitPts[i].z;
        if (fitPts[i].z > fz1) fz1 = fitPts[i].z;
      }
      cam.tx = (fx0 + fx1) / 2;
      cam.tz = (fz0 + fz1) / 2;
      sun.target.position.set(cam.tx, 0, cam.tz);
      sun.position.set(cam.tx + 220, 330, cam.tz + 170);

      var ground = new THREE.Mesh(
        new THREE.PlaneGeometry(6000, 6000),
        groundMat = new THREE.MeshStandardMaterial({
          color: nightMode ? 0x080b10 : 0x10151b, roughness: 1
        })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(cam.tx, 0, cam.tz);
      ground.receiveShadow = true;
      staticGroup.add(ground);

      var scenery = blockScenery();
      var plants = new THREE.Mesh(
        scenery.geo,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })
      );
      plants.receiveShadow = true;
      staticGroup.add(plants);

      // the rides and the other moving parts stand in their own objects
      for (var sm = 0; sm < scenery.meshes.length; sm++) {
        scenery.meshes[sm].traverse(function (o) {
          if (!o.isMesh) return;
          if (o.material && o.material.transparent) {
            o.castShadow = false;
            return;
          }
          o.castShadow = true;
          o.receiveShadow = true;
        });
        staticGroup.add(scenery.meshes[sm]);
      }
      sceneryActors = scenery.actors;
      sceneryMeshes = scenery.meshes;

      // the streets and the ring of houses around the map
      nightMeshes.length = 0;
      var cityApi = { rgb: rgb, merge: mergeColored, rnd: seeded(9182736) };
      var city = City.build(cityApi, {
        blocks: scenery.blocks,
        map: {
          x0: CFG.MARGIN_X - CFG.ROAD_W / 2,
          x1: CFG.MARGIN_X + (CFG.COLS - 1) * CFG.BLOCK_X + CFG.ROAD_W / 2,
          y0: CFG.MARGIN_Y - CFG.ROAD_W / 2,
          y1: CFG.MARGIN_Y + (CFG.ROWS - 1) * CFG.BLOCK_Y + CFG.ROAD_W / 2
        }
      });
      var cityMesh = new THREE.Mesh(
        mergeColored(city.parts),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
      );
      cityMesh.castShadow = true;
      cityMesh.receiveShadow = true;
      staticGroup.add(cityMesh);

      // the windows that shine and the lamps of the streets
      var glowMesh = new THREE.Mesh(
        mergeColored(city.glow),
        new THREE.MeshBasicMaterial({
          vertexColors: true, transparent: true, opacity: 0.94
        })
      );
      glowMesh.visible = nightMode;
      staticGroup.add(glowMesh);
      nightMeshes.push(glowMesh);

      // the pools of light the lamps throw on the road, soft at the edges
      var poolMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { glowColor: { value: new THREE.Color(0xffcf94) } },
        vertexShader: 'varying vec2 vP; void main() { vP = uv; ' +
          'gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 glowColor; varying vec2 vP; void main() { ' +
          'float d = length(vP - vec2(0.5)) * 2.0; ' +
          'float a = pow(max(0.0, 1.0 - d), 2.2); ' +
          'gl_FragColor = vec4(glowColor, a * 0.5); }'
      });
      var poolMesh = new THREE.Mesh(mergeColored(city.pools), poolMat);
      poolMesh.visible = nightMode;
      staticGroup.add(poolMesh);
      nightMeshes.push(poolMesh);

      roadMat = new THREE.MeshStandardMaterial({
        color: COL.road, roughness: rainMode ? 0.32 : 0.95, metalness: rainMode ? 0.35 : 0
      });
      var boxMat = new THREE.MeshStandardMaterial({ color: COL.box, roughness: 0.95 });
      var edgeMat = new THREE.MeshStandardMaterial({ color: COL.edge, roughness: 0.9 });
      var markMat = new THREE.MeshStandardMaterial({ color: COL.mark, roughness: 0.9 });
      var stopMat = new THREE.MeshStandardMaterial({ color: COL.stopLine, roughness: 0.9 });

      var dashes = [];
      var stops = [];
      var manholes = [];

      for (i = 0; i < net.nodes.length; i++) {
        var node = net.nodes[i];
        for (d = 0; d < 4; d++) {
          var v = DIRS[d];
          var ang = Math.atan2(v.y, v.x);
          var lane = net.laneFrom(node, d);
          var len;
          if (lane) {
            len = lane.len - CFG.BOX;
            roadBand(node.x + v.x * (CFG.BOX / 2 + len / 2), node.y + v.y * (CFG.BOX / 2 + len / 2),
              ang, len, CFG.ROAD_W, roadMat, ROAD_TOP);
            for (var s = CFG.BOX / 2; s < lane.len - CFG.BOX / 2; s += 22) {
              dashes.push({ x: node.x + v.x * (s + 5), z: node.y + v.y * (s + 5), ang: ang });
            }
            // the manholes of the road
            var mh = 1 + ((Math.random() * 2) | 0);
            for (var mi = 0; mi < mh; mi++) {
              var ms = CFG.BOX / 2 + 18 + Math.random() * (len - 36);
              manholes.push({ x: node.x + v.x * ms, z: node.y + v.y * ms });
            }
          } else {
            len = CFG.STUB - CFG.BOX / 2;
            roadBand(node.x + v.x * (CFG.BOX / 2 + len / 2), node.y + v.y * (CFG.BOX / 2 + len / 2),
              ang, len, CFG.ROAD_W, roadMat, ROAD_TOP);
          }
        }

        var jb = new THREE.Mesh(unitBox, boxMat);
        jb.position.set(node.x, ROAD_TOP / 2, node.y);
        jb.scale.set(CFG.BOX, ROAD_TOP, CFG.BOX);
        jb.receiveShadow = true;
        staticGroup.add(jb);

        for (d = 0; d < 4; d++) {
          var inId = node.in[d];
          if (!inId) continue;
          var il = net.lanes[inId];
          var vv = DIRS[il.dir];
          var ss = il.len - STOP_BACK - 2;
          stops.push({
            x: il.p0.x + vv.x * ss,
            z: il.p0.y + vv.y * ss,
            ang: Math.atan2(vv.y, vv.x)
          });
        }
      }

      // painted edge lines along both sides of every road band
      var edges = [];
      for (i = 0; i < net.nodes.length; i++) {
        var nd = net.nodes[i];
        for (d = 0; d < 4; d++) {
          var vv2 = DIRS[d];
          var ang2 = Math.atan2(vv2.y, vv2.x);
          var lane2 = net.laneFrom(nd, d);
          var len2 = lane2 ? lane2.len - CFG.BOX : CFG.STUB - CFG.BOX / 2;
          var start = lane2 ? CFG.BOX / 2 : CFG.BOX / 2;
          var mid = nd.x + vv2.x * (start + len2 / 2);
          var midz = nd.y + vv2.y * (start + len2 / 2);
          var rx = -vv2.y, ry = vv2.x;
          edges.push({ x: mid + rx * (CFG.ROAD_W / 2 - 1.4), z: midz + ry * (CFG.ROAD_W / 2 - 1.4), ang: ang2, len: len2 });
          edges.push({ x: mid - rx * (CFG.ROAD_W / 2 - 1.4), z: midz - ry * (CFG.ROAD_W / 2 - 1.4), ang: ang2, len: len2 });
        }
      }

      var dummy = new THREE.Object3D();

      var dashMesh = new THREE.InstancedMesh(unitBox, markMat, Math.max(1, dashes.length));
      for (i = 0; i < dashes.length; i++) {
        dummy.position.set(dashes[i].x, ROAD_TOP + 0.01, dashes[i].z);
        dummy.rotation.set(0, -dashes[i].ang, 0);
        dummy.scale.set(10, 0.02, 1.8);
        dummy.updateMatrix();
        dashMesh.setMatrixAt(i, dummy.matrix);
      }
      dashMesh.count = dashes.length;
      dashMesh.receiveShadow = true;
      staticGroup.add(dashMesh);

      var edgeMesh = new THREE.InstancedMesh(unitBox, edgeMat, Math.max(1, edges.length));
      for (i = 0; i < edges.length; i++) {
        dummy.position.set(edges[i].x, ROAD_TOP + 0.01, edges[i].z);
        dummy.rotation.set(0, -edges[i].ang, 0);
        dummy.scale.set(edges[i].len, 0.02, 2.2);
        dummy.updateMatrix();
        edgeMesh.setMatrixAt(i, dummy.matrix);
      }
      edgeMesh.count = edges.length;
      edgeMesh.receiveShadow = true;
      staticGroup.add(edgeMesh);

      var stopMesh = new THREE.InstancedMesh(unitBox, stopMat, Math.max(1, stops.length));
      for (i = 0; i < stops.length; i++) {
        dummy.position.set(stops[i].x, ROAD_TOP + 0.01, stops[i].z);
        dummy.rotation.set(0, -stops[i].ang, 0);
        dummy.scale.set(3.4, 0.02, 17);
        dummy.updateMatrix();
        stopMesh.setMatrixAt(i, dummy.matrix);
      }
      stopMesh.count = stops.length;
      stopMesh.receiveShadow = true;
      staticGroup.add(stopMesh);

      /* ---------------------------------------------- the paint on the road */

      var paint = [];
      function painted(geo, hex) { paint.push({ geo: geo, color: rgb(hex) }); }

      // a stripe lying on the road, `ang` is the way the road runs
      function stripe(len, wide, x, z, ang, hex, lift) {
        var g = new THREE.BoxGeometry(len, 0.05, wide);
        g.rotateY(-ang);
        g.translate(x, ROAD_TOP + (lift || 0.025), z);
        painted(g, hex);
      }

      for (i = 0; i < net.nodes.length; i++) {
        var node3 = net.nodes[i];
        for (d = 0; d < 4; d++) {
          var inId2 = node3.in[d];
          if (!inId2) continue;
          var il2 = net.lanes[inId2];
          var vv = DIRS[il2.dir];
          var ang2 = Math.atan2(vv.y, vv.x);
          // the lane of this approach lies on the right of the road
          var rx = -vv.y, rz = vv.x;
          var off = CFG.LANE_OFF;

          // the crossing: a band of stripes in front of the junction
          var cx2 = node3.x - vv.x * (CFG.BOX / 2 + 8);
          var cz2 = node3.y - vv.y * (CFG.BOX / 2 + 8);
          for (var k = -3; k <= 3; k++) {
            stripe(4.6, 3.2, cx2 + rx * k * 6, cz2 + rz * k * 6, ang2, 0xdfe6ec);
          }

          // the arrow that shows which way the lane goes
          var ax2 = node3.x - vv.x * 52 + rx * off;
          var az2 = node3.y - vv.y * 52 + rz * off;
          stripe(7, 1.6, ax2, az2, ang2, 0xe8ecf0);
          for (var sd = -1; sd <= 1; sd += 2) {
            var a3 = ang2 + sd * 0.55;
            var bdx = Math.cos(a3), bdz = Math.sin(a3);
            var hb = new THREE.BoxGeometry(4.4, 0.05, 1.5);
            hb.rotateY(-a3);
            hb.translate(ax2 + vv.x * 3.5 - bdx * 2.2, ROAD_TOP + 0.025,
              az2 + vv.y * 3.5 - bdz * 2.2);
            painted(hb, 0xe8ecf0);
          }

          // the bump before the crossing
          var bumpX = node3.x - vv.x * 44 + rx * off;
          var bumpZ = node3.y - vv.y * 44 + rz * off;
          var bump = new THREE.BoxGeometry(6, 0.55, 9);
          bump.rotateY(-ang2);
          bump.translate(bumpX, ROAD_TOP + 0.275, bumpZ);
          painted(bump, 0xd8b13a);
          for (var q = -1; q <= 1; q++) {
            stripe(1.4, 9.2, bumpX + vv.x * q * 2, bumpZ + vv.y * q * 2, ang2, 0x22262c, 0.56);
          }
        }
      }

      // the manholes in the road
      for (i = 0; i < manholes.length; i++) {
        var mg = new THREE.CylinderGeometry(2.2, 2.2, 0.12, 14);
        mg.translate(manholes[i].x, ROAD_TOP + 0.06, manholes[i].z);
        painted(mg, 0x3a4048);
      }

      var paintMesh = new THREE.Mesh(
        mergeColored(paint),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
      );
      paintMesh.receiveShadow = true;
      staticGroup.add(paintMesh);

      /* ------------------------------------------------ signal heads */

      var poleMat = new THREE.MeshStandardMaterial({ color: COL.pole, roughness: 0.55, metalness: 0.5 });
      var visorMat = new THREE.MeshStandardMaterial({ color: 0x1b2027, roughness: 0.8, side: THREE.DoubleSide });
      var beaconGeo = new THREE.SphereGeometry(0.8, 12, 8);
      var haloGeo = new THREE.SphereGeometry(2.9, 14, 10);

      var poleGeo = new THREE.CylinderGeometry(0.45, 0.62, 34, 12);
      var armGeo = new THREE.CylinderGeometry(0.36, 0.36, 14.5, 10);
      armGeo.rotateZ(Math.PI / 2);
      var braceGeo = new THREE.CylinderGeometry(0.2, 0.2, 17.4, 8);
      var hangGeo = new THREE.CylinderGeometry(0.28, 0.28, 1.8, 8);
      var housingGeo = new THREE.BoxGeometry(6.4, 14.0, 2.2);

      // a lens is a disc plus the hood that shades it, merged into one mesh
      var discGeo = new THREE.CylinderGeometry(1.7, 1.7, 0.5, 22);
      discGeo.rotateX(Math.PI / 2);
      discGeo.translate(0, 0, 1.45);
      var hoodGeo = new THREE.CylinderGeometry(2.3, 1.75, 2.4, 22, 1, true);
      hoodGeo.rotateX(Math.PI / 2);
      hoodGeo.translate(0, 0, 3.2);
      var lensGeo = mergeParts([discGeo, hoodGeo]);

      // the backing plate, a frame around the lens column and a frame around
      // the back of the plate: both frames light up in the colour of the
      // signal, so the state can be read from the front and from behind
      var plateGeo = new THREE.BoxGeometry(7.4, 15.0, 0.8);
      plateGeo.translate(0, 0, -1.6);
      var plateParts = [plateGeo];
      var plateMats = [0];
      var trims = [[5.4, 0.5, 0, 6.45, 1.45], [5.4, 0.5, 0, -6.45, 1.45],
      [0.5, 12.4, 2.45, 0, 1.45], [0.5, 12.4, -2.45, 0, 1.45],
      [7.4, 0.45, 0, 7.28, -2.05], [7.4, 0.45, 0, -7.28, -2.05],
      [0.45, 14.1, 3.48, 0, -2.05], [0.45, 14.1, -3.48, 0, -2.05]];
      for (i = 0; i < trims.length; i++) {
        var tg = new THREE.BoxGeometry(trims[i][0], trims[i][1], 0.5);
        tg.translate(trims[i][2], trims[i][3], trims[i][4]);
        plateParts.push(tg);
        plateMats.push(1);
      }
      var plateMerged = mergeParts(plateParts);

      for (i = 0; i < net.nodes.length; i++) {
        var node2 = net.nodes[i];
        var housingMat = new THREE.MeshStandardMaterial({
          color: 0x252c35, roughness: 0.6, metaleness: 0.25, emissive: 0x000000
        });
        var beaconMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.4, emissive: 0x000000 });
        // one set of lens, plate and halo materials per axis
        var axisMats = { V: [], H: [] };
        var axisHalos = { V: [], H: [] };
        var axisPlates = { V: null, H: null };
        var axisTrims = { V: null, H: null };
        var axes = ['V', 'H'];
        for (var a = 0; a < 2; a++) {
          var ax = axes[a];
          for (var k = 0; k < 3; k++) {
            axisMats[ax][k] = new THREE.MeshStandardMaterial({
              color: LENS[k].off, roughness: 0.3, emissive: 0x000000, emissiveIntensity: 0
            });
            // the halo around a lit lens, so the colour shows from every side
            axisHalos[ax][k] = new THREE.MeshBasicMaterial({
              color: LENS[k].on, transparent: true, opacity: 0.3,
              blending: THREE.AdditiveBlending, depthWrite: false
            });
          }
          // the dark backboard behind the lenses
          axisPlates[ax] = new THREE.MeshStandardMaterial({
            color: 0x141a21, roughness: 0.85
          });
          // the frames around the lens column and around the back of the
          // plate light up in the colour of the signal
          axisTrims[ax] = new THREE.MeshStandardMaterial({
            color: 0x6b4d12, roughness: 0.7, emissive: 0x000000, emissiveIntensity: 1.2
          });
        }

        var list = spots[i];
        var north = null, first = null;
        for (var si = 0; si < list.length; si++) {
          var sp = list[si];
          var g = new THREE.Group();
          g.position.set(sp.x, 0, sp.z);
          g.rotation.y = sp.ang;

          // the pole stands on the corner, the arm carries the head over the lane
          var pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.y = 17;
          g.add(pole);

          var arm = new THREE.Mesh(armGeo, poleMat);
          arm.position.set(-7.25, 32, 0);
          g.add(arm);

          var brace = new THREE.Mesh(braceGeo, poleMat);
          brace.rotation.z = 0.842;
          brace.position.set(-6.5, 25.8, 0);
          g.add(brace);

          var hang = new THREE.Mesh(hangGeo, poleMat);
          hang.position.set(-14, 31.9, 0);
          g.add(hang);

          // the head itself hangs from the end of the arm
          var head = new THREE.Group();
          head.position.set(-14, 0, 0);
          g.add(head);

          var matArr = [];
          for (var q = 0; q < plateMats.length; q++) {
            matArr.push(plateMats[q] === 0 ? axisPlates[sp.axis] : axisTrims[sp.axis]);
          }
          var plate = new THREE.Mesh(plateMerged, matArr);
          plate.position.y = HOOD_Y;
          head.add(plate);

          var housing = new THREE.Mesh(housingGeo, housingMat);
          housing.position.y = HOOD_Y;
          housing.userData.node = node2;
          head.add(housing);
          pickables.push(housing);

          var mats = axisMats[sp.axis];
          var halos = axisHalos[sp.axis];
          for (k = 0; k < 3; k++) {
            var lensY = HOOD_Y + 4.3 - k * 4.3;
            var lens = new THREE.Mesh(lensGeo, [mats[k], visorMat]);
            lens.position.y = lensY;
            lens.userData.node = node2;
            head.add(lens);
            pickables.push(lens);

            var halo = new THREE.Mesh(haloGeo, halos[k]);
            halo.position.set(0, lensY, 1.7);
            halo.visible = false;
            head.add(halo);
          }

          lightGroup.add(g);
          if (!first) first = g;
          if (sp.side === 3) north = g;
        }

        // the beacon marks a junction that is under manual control
        var beaconHost = north || first;
        if (beaconHost) {
          var beacon = new THREE.Mesh(beaconGeo, beaconMat);
          beacon.position.y = 34.8;
          beaconHost.add(beacon);
        }

        heads.push({
          node: node2, spots: list, housingMat: housingMat, beaconMat: beaconMat,
          lens: axisMats, halo: axisHalos, trim: axisTrims
        });
      }
    }

    /* ------------------------------------------------------- drawing */

    var tmpColor = new THREE.Color();
    var tmpTrim = new THREE.Color();
    var bgColor = new THREE.Color(BG);
    var carMatrix = new THREE.Matrix4();
    var wheelLocal = new THREE.Matrix4();
    var wheelMatrix = new THREE.Matrix4();
    var quat = new THREE.Quaternion();
    var up = new THREE.Vector3(0, 1, 0);
    var pos = new THREE.Vector3();
    var scale = new THREE.Vector3(1, 1, 1);
    var vec = new THREE.Vector3();

    function render(sim, hoverNode, dt) {
      var cars = sim.cars;
      var i, w;

      var counts = [];
      for (i = 0; i < carModels.length; i++) counts.push(0);
      for (i = 0; i < cars.length; i++) counts[modelIndex(cars[i].type)]++;
      ensureCars(counts);

      var used = [];
      for (i = 0; i < carModels.length; i++) used.push(0);

      // which vehicle sits in which instance slot, so a click can be traced
      // back to the car it hit
      carSlots.length = 0;
      carBodies.length = 0;
      for (i = 0; i < carModels.length; i++) {
        carSlots.push([]);
        if (carModels[i].bodyMesh) carBodies.push(carModels[i].bodyMesh);
      }

      // while a car is followed, the cars standing between the camera and it
      // would hide it completely, so they are taken out of the way
      var target = (follow.car && !follow.leaving) ? follow.car : null;
      var tpx = 0, tpz = 0, fpx = 0, fpz = 0, tlen2 = 0;
      if (target) {
        var tp = target.pos();
        tpx = tp.x; tpz = tp.y;
        fpx = camera.position.x; fpz = camera.position.z;
        var tdx = tpx - fpx, tdz = tpz - fpz;
        tlen2 = tdx * tdx + tdz * tdz;
      }

      for (i = 0; i < cars.length; i++) {
        var car = cars[i];
        var mi = modelIndex(car.type);
        var m = carModels[mi];
        var idx = used[mi]++;
        carSlots[mi][idx] = car;
        var p = car.pos();
        quat.setFromAxisAngle(up, -car.heading());
        pos.set(p.x, 0, p.y);

        var hide = false;
        if (target && car !== target && tlen2 > 0) {
          var vx = p.x - fpx, vz = p.y - fpz;
          var dot = vx * (tpx - fpx) + vz * (tpz - fpz);
          if (dot > 0 && dot < tlen2) {
            var t = dot / tlen2;
            var ox = p.x - (fpx + (tpx - fpx) * t);
            var oz = p.y - (fpz + (tpz - fpz) * t);
            if (ox * ox + oz * oz < 81) hide = true;
          }
        }
        if (hide) scale.set(0.001, 0.001, 0.001);
        else scale.set(1, 1, 1);

        carMatrix.compose(pos, quat, scale);

        m.bodyMesh.setMatrixAt(idx, carMatrix);
        m.lightMesh.setMatrixAt(idx, carMatrix);
        if (m.glassMesh) m.glassMesh.setMatrixAt(idx, carMatrix);
        if (m.trimMesh) m.trimMesh.setMatrixAt(idx, carMatrix);

        tmpColor.set(car.color);
        if (car.fade < 1) tmpColor.lerp(bgColor, 1 - car.fade);
        m.bodyMesh.setColorAt(idx, tmpColor);
        if (m.trimMesh) {
          // the trim keeps its own colour, so it is only tinted white
          tmpTrim.set(0xffffff);
          if (car.fade < 1) tmpTrim.lerp(bgColor, 1 - car.fade);
          m.trimMesh.setColorAt(idx, tmpTrim);
        }

        var nw = m.wheels.length;
        for (w = 0; w < nw; w++) {
          var wp = m.wheels[w];
          wheelLocal.makeRotationX(Math.PI / 2);
          wheelLocal.setPosition(wp[0], m.wheelR, wp[1]);
          wheelMatrix.multiplyMatrices(carMatrix, wheelLocal);
          m.wheelMesh.setMatrixAt(idx * nw + w, wheelMatrix);
        }
      }

      for (i = 0; i < carModels.length; i++) {
        var mm = carModels[i];
        var n = used[i];
        if (!mm.bodyMesh) continue;
        mm.bodyMesh.count = n;
        mm.lightMesh.count = n;
        mm.wheelMesh.count = n * mm.wheels.length;
        mm.bodyMesh.instanceMatrix.needsUpdate = true;
        mm.lightMesh.instanceMatrix.needsUpdate = true;
        mm.wheelMesh.instanceMatrix.needsUpdate = true;
        if (mm.bodyMesh.instanceColor) mm.bodyMesh.instanceColor.needsUpdate = true;
        if (mm.glassMesh) {
          mm.glassMesh.count = n;
          mm.glassMesh.instanceMatrix.needsUpdate = true;
        }
        if (mm.trimMesh) {
          mm.trimMesh.count = n;
          mm.trimMesh.instanceMatrix.needsUpdate = true;
          if (mm.trimMesh.instanceColor) mm.trimMesh.instanceColor.needsUpdate = true;
        }
      }

      for (var h = 0; h < heads.length; h++) {
        var head = heads[h];
        var light = head.node.light;
        var stV = light.colorFor('V');
        var stH = light.colorFor('H');
        applyAxis(head.lens.V, head.halo.V, stV);
        applyAxis(head.lens.H, head.halo.H, stH);

        // the frames around the lenses light up in the colour of the signal,
        // so the state can be read from the front and from behind
        head.trim.V.emissive.setHex(signalHex(stV));
        head.trim.H.emissive.setHex(signalHex(stH));

        var hot = hoverNode === head.node;
        head.housingMat.emissive.setHex(hot ? 0x1b3f57 : 0x000000);
        head.housingMat.emissiveIntensity = hot ? 0.8 : 0;

        var flag = light.allRed ? 'red' : (light.manual && sim.autoMode ? 'manual' : 'off');
        var bc = flag === 'red' ? 0xff4d4d : (flag === 'manual' ? 0x7fd1ff : 0x2a2f38);
        head.beaconMat.color.setHex(bc);
        head.beaconMat.emissive.setHex(flag === 'off' ? 0x000000 : bc);
      }

      sceneryClock += dt || 0;
      for (var a = 0; a < sceneryActors.length; a++) sceneryActors[a].update(sceneryClock);
      sky.update(dt || 0, cam.tx, cam.tz);

      updateCamera(dt || 0, sim);
      updateShadow();
      renderer.render(scene, camera);
    }

    function signalHex(state) {
      if (state === 'red') return LENS[0].on;
      if (state === 'yellow') return LENS[1].on;
      return LENS[2].on;
    }

    // light one lens of a stack, the other two go dark
    function applyAxis(mats, halos, state) {
      for (var k = 0; k < 3; k++) {
        var lit = (k === 0 && state === 'red') ||
          (k === 1 && state === 'yellow') ||
          (k === 2 && state === 'green');
        mats[k].color.setHex(lit ? LENS[k].on : LENS[k].off);
        mats[k].emissive.setHex(lit ? LENS[k].on : 0x000000);
        mats[k].emissiveIntensity = lit ? 1.6 : 0;
        halos[k].visible = lit;
      }
    }

    /* ---------------------------------------------------- interaction */

    var raycaster = new THREE.Raycaster();
    var ndc = new THREE.Vector2();

    // what is under the pointer: a signal head, a car, or nothing
    function pickAt(clientX, clientY) {
      var out = { node: null, car: null };
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return out;
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);

      var hits = raycaster.intersectObjects(pickables, false);
      var nodeD = Infinity;
      if (hits.length) {
        out.node = hits[0].object.userData.node;
        nodeD = hits[0].distance;
      }

      var ch = raycaster.intersectObjects(carBodies, false);
      for (var i = 0; i < ch.length; i++) {
        if (ch[i].distance > nodeD) break;
        var list = carSlots[ch[i].object.userData.model];
        var car = list && list[ch[i].instanceId];
        if (car) { out.node = null; out.car = car; break; }
      }
      return out;
    }

    // where a car sits on the screen, for the tooltip
    function carScreen(car) {
      var p = car.pos();
      vec.set(p.x, 4, p.y);
      camera.updateMatrixWorld();
      vec.project(camera);
      var rect = canvas.getBoundingClientRect();
      return {
        x: (vec.x * 0.5 + 0.5) * rect.width,
        y: (-vec.y * 0.5 + 0.5) * rect.height
      };
    }

    function lampScreen(node) {
      var entry = null, i;
      for (i = 0; i < heads.length; i++) {
        if (heads[i].node === node) { entry = heads[i]; break; }
      }
      if (!entry) return { x: 0, y: 0 };
      // the head the driver of the camera sees first
      var best = entry.spots[0], bestD = Infinity;
      for (i = 0; i < entry.spots.length; i++) {
        var s = entry.spots[i];
        var dx = s.x - camera.position.x, dz = s.z - camera.position.z;
        var d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = s; }
      }
      vec.set(best.x, HOOD_Y, best.z);
      camera.updateMatrixWorld();
      vec.project(camera);
      var rect = canvas.getBoundingClientRect();
      return {
        x: (vec.x * 0.5 + 0.5) * rect.width,
        y: (-vec.y * 0.5 + 0.5) * rect.height
      };
    }

    function orbit(dx, dy) {
      if (follow.car) return;
      cam.az -= dx * 0.005;
      cam.el = Math.max(0.12, Math.min(1.45, cam.el - dy * 0.004));
      updateCamera(0, null);
    }

    function pan(dx, dy) {
      if (follow.car) return;
      var k = cam.r * 0.0016;
      var rx = Math.cos(cam.az), rz = -Math.sin(cam.az);
      var fx = -Math.sin(cam.az), fz = -Math.cos(cam.az);
      cam.tx += (-rx * dx + fx * dy) * k;
      cam.tz += (-rz * dx + fz * dy) * k;
      updateCamera(0, null);
    }

    function zoom(delta) {
      if (follow.car) return;
      cam.zoom = Math.max(0.12, Math.min(3, cam.zoom * (1 + delta * 0.0013)));
      updateCamera(0, null);
    }

    // multiply the zoom level directly, used by the touch pinch gesture
    function zoomBy(factor) {
      if (follow.car) return;
      if (!isFinite(factor) || factor <= 0) return;
      cam.zoom = Math.max(0.12, Math.min(3, cam.zoom * factor));
      updateCamera(0, null);
    }

    // start following a car, or let go of the one being followed
    function followCar(car) {
      follow.car = car;
      follow.leaving = false;
      follow.ready = false;
      startAnim(FOLLOW_IN);
    }

    function unfollow() {
      if (!follow.car) return;
      follow.leaving = true;
      startAnim(FOLLOW_OUT);
    }

    function followed() {
      return follow.leaving ? null : follow.car;
    }

    function resize() {
      var stage = canvas.parentElement.getBoundingClientRect();
      var w = Math.max(320, Math.floor(stage.width - 12));
      var h = Math.max(200, Math.floor(stage.height - 12));
      renderer.setSize(w, h, false);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    return {
      build: build,
      render: render,
      pickAt: pickAt,
      lampScreen: lampScreen,
      carScreen: carScreen,
      follow: followCar,
      unfollow: unfollow,
      followed: followed,
      orbit: orbit,
      pan: pan,
      zoom: zoom,
      zoomBy: zoomBy,
      resize: resize,
      setNight: setNight,
      setRain: setRain
    };
  }

  return { create: create };
})();
