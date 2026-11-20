/* The city around the map.

   The streets of the map get sidewalks, kerbs and street lamps, and outside
   the map stands a ring of buildings.  Their facades carry the details that
   make a block of flats look like a block of flats: windows, balconies, air
   conditioners, shop signs and neon.

   Everything that shines is collected in a second geometry, so it can be
   hidden in daylight and switched on when the sun goes down. */
var City = (function () {

  var C = {
    walk: 0x7a8089,       // the sidewalk
    kerb: 0x9aa3ad,       // the lip along the road
    street: 0x2c3138,     // the asphalt outside the map
    wall: [0x6e7480, 0x7a7f8c, 0x847a70, 0x5f6b78, 0x8a7d63, 0x6b6478],
    roof: 0x454b54,
    trim: 0x8d95a3,
    glass: 0x1b2531,      // a window in daylight
    ac: 0xa2a8b0,
    rail: 0x8d949e,
    pole: 0x59616e,
    lamp: 0xffe6a6,
    shop: [0x8e3b3b, 0x2f6b8a, 0x7c5a26, 0x357a49, 0x6b3a7a],
    neon: [0xff4d6d, 0x54d6ff, 0xffd166, 0x86f79b, 0xc98bff],
    lit: [0xffd9a0, 0xfff0d6, 0xd6e8ff, 0xffc98a]
  };

  function build(api, opts) {
    var parts = [], glow = [], pools = [];
    var rnd = api.rnd;
    var map = opts.map;

    function add(geo, hex) { parts.push({ geo: geo, color: api.rgb(hex) }); }
    function shine(geo, hex) { glow.push({ geo: geo, color: api.rgb(hex) }); }
    function pool(geo) { pools.push({ geo: geo, color: api.rgb(0xffd9a0) }); }

    function bx(w, h, d, x, y, z, hex) {
      var g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      add(g, hex);
    }
    function sb(w, h, d, x, y, z, hex) {
      var g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      shine(g, hex);
    }
    function cyl(r, h, x, y, z, hex, seg) {
      var g = new THREE.CylinderGeometry(r, r, h, seg || 8);
      g.translate(x, y, z);
      add(g, hex);
    }

    /* ---------------------------------------------------------- street lamp

       The pole stands on the sidewalk, the arm reaches over the road and the
       head above it throws a pool of light on the asphalt. */
    function lamp(x, z, dx, dz) {
      cyl(0.5, 10, x, 5, z, C.pole);
      var hx = x + dx * 5, hz = z + dz * 5;
      if (dx) bx(5.4, 0.5, 0.5, x + dx * 2.7, 9.8, z, C.pole);
      else bx(0.5, 0.5, 5.4, x, 9.8, z + dz * 2.7, C.pole);
      bx(2.6, 0.8, 1.4, hx, 9.3, hz, C.trim);
      sb(2.4, 0.35, 1.3, hx, 8.85, hz, C.lamp);
      var g = new THREE.CircleGeometry(13, 22);
      g.rotateX(-Math.PI / 2);
      g.translate(hx, 0.34, hz);
      pool(g);
    }

    /* --------------------------------------------------------- the sidewalk */

    function walk(x0, x1, z0, z1) {
      bx(x1 - x0, 1.5, z1 - z0, (x0 + x1) / 2, 0.75, (z0 + z1) / 2, C.walk);
    }
    function kerb(x0, x1, z0, z1) {
      bx(x1 - x0, 1.9, z1 - z0, (x0 + x1) / 2, 0.95, (z0 + z1) / 2, C.kerb);
    }

    // the sidewalk around one block, with the kerb along the road
    function blockWalk(b) {
      var w = 4;
      walk(b.x0, b.x1, b.y0 - w, b.y0);
      walk(b.x0, b.x1, b.y1, b.y1 + w);
      walk(b.x0 - w, b.x0, b.y0 - w, b.y1 + w);
      walk(b.x1, b.x1 + w, b.y0 - w, b.y1 + w);
      kerb(b.x0, b.x1, b.y0 - w, b.y0 - w + 0.9);
      kerb(b.x0, b.x1, b.y1 + w - 0.9, b.y1 + w);
      kerb(b.x0 - w, b.x0 - w + 0.9, b.y0 - w, b.y1 + w);
      kerb(b.x1 + w - 0.9, b.x1 + w, b.y0 - w, b.y1 + w);
    }

    // the sidewalks on the outside of the four outer roads
    function outerWalks() {
      var m = CFG.BOX / 2;
      var y0 = CFG.MARGIN_Y, y1 = CFG.MARGIN_Y + (CFG.ROWS - 1) * CFG.BLOCK_Y;
      var w = 4;
      walk(map.x0 - w, map.x0, y0 + m, y1 - m);
      walk(map.x1, map.x1 + w, y0 + m, y1 - m);
      kerb(map.x0 - w, map.x0 - w + 0.9, y0 + m, y1 - m);
      kerb(map.x1 + w - 0.9, map.x1 + w, y0 + m, y1 - m);
      for (var c = 0; c < CFG.COLS - 1; c++) {
        var ax = CFG.MARGIN_X + c * CFG.BLOCK_X + m;
        var bx2 = CFG.MARGIN_X + (c + 1) * CFG.BLOCK_X - m;
        walk(ax, bx2, map.y0 - w, map.y0);
        walk(ax, bx2, map.y1, map.y1 + w);
        kerb(ax, bx2, map.y0 - w, map.y0 - w + 0.9);
        kerb(ax, bx2, map.y1 + w - 0.9, map.y1 + w);
      }
    }

    // lamps along a sidewalk: `axis` is the way the walk runs, `dir` the way
    // the road lies from it
    function lampsAlong(axis, fixed, from, to, dir) {
      for (var t = from + 16; t < to - 16; t += 44) {
        if (axis === 'x') lamp(t, fixed, 0, dir);
        else lamp(fixed, t, dir, 0);
      }
    }

    /* ------------------------------------------------------------- a house */

    // the windows along one face: `along` is the axis the face runs in
    function windows(along, a0, a1, fixed, dir, floors) {
      for (var f = 0; f < floors; f++) {
        var y = 5.2 + f * 5.6;
        for (var a = a0 + 3.6; a < a1 - 3.2; a += 6.6) {
          var g = new THREE.BoxGeometry(along === 'x' ? 2.7 : 0.5,
            2.5, along === 'x' ? 0.5 : 2.7);
          if (along === 'x') g.translate(a, y, fixed + dir * 0.24);
          else g.translate(fixed + dir * 0.24, y, a);
          add(g, C.glass);
          if (rnd() < 0.45) {
            var lg = new THREE.BoxGeometry(along === 'x' ? 2.4 : 0.3,
              2.2, along === 'x' ? 0.3 : 2.4);
            if (along === 'x') lg.translate(a, y, fixed + dir * 0.55);
            else lg.translate(fixed + dir * 0.55, y, a);
            shine(lg, C.lit[(rnd() * C.lit.length) | 0]);
          }
          // an air conditioner under the window
          if (rnd() < 0.32) {
            var ag = new THREE.BoxGeometry(along === 'x' ? 1.7 : 1.0,
              1.2, along === 'x' ? 1.0 : 1.7);
            if (along === 'x') ag.translate(a + 0.7, y - 2.1, fixed + dir * 0.7);
            else ag.translate(fixed + dir * 0.7, y - 2.1, a + 0.7);
            add(ag, C.ac);
          }
        }
      }
    }

    // one building with its facade
    function house(x0, x1, z0, z1, tall) {
      var w = x1 - x0, d = z1 - z0;
      var h = tall ? 24 + rnd() * 24 : 12 + rnd() * 15;
      var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      var wall = C.wall[(rnd() * C.wall.length) | 0];
      bx(w, h, d, cx, h / 2, cz, wall);
      // the roof slab
      bx(w + 1.2, 0.9, d + 1.2, cx, h + 0.45, cz, C.roof);

      var floors = Math.max(1, Math.floor((h - 5.6) / 5.6));
      windows('x', x0, x1, z0, -1, floors);
      windows('x', x0, x1, z1, 1, floors);
      windows('z', z0, z1, x0, -1, floors);
      windows('z', z0, z1, x1, 1, floors);

      // a balcony on the street side
      if (rnd() < 0.55 && floors > 1) {
        var by = 5.2 + ((rnd() * (floors - 1)) | 0) * 5.6;
        var side = (rnd() * 4) | 0;
        var bo, br;
        if (side === 0) {
          bo = new THREE.BoxGeometry(10, 0.5, 2.4);
          bo.translate(cx + (rnd() - 0.5) * 12, by - 1.7, z0 - 1.2);
          br = new THREE.BoxGeometry(10, 1.5, 0.4);
          br.translate(cx + (rnd() - 0.5) * 12, by - 0.9, z0 - 2.3);
        } else if (side === 1) {
          bo = new THREE.BoxGeometry(10, 0.5, 2.4);
          bo.translate(cx + (rnd() - 0.5) * 12, by - 1.7, z1 + 1.2);
          br = new THREE.BoxGeometry(10, 1.5, 0.4);
          br.translate(cx + (rnd() - 0.5) * 12, by - 0.9, z1 + 2.3);
        } else if (side === 2) {
          bo = new THREE.BoxGeometry(2.4, 0.5, 10);
          bo.translate(x0 - 1.2, by - 1.7, cz + (rnd() - 0.5) * 12);
          br = new THREE.BoxGeometry(0.4, 1.5, 10);
          br.translate(x0 - 2.3, by - 0.9, cz + (rnd() - 0.5) * 12);
        } else {
          bo = new THREE.BoxGeometry(2.4, 0.5, 10);
          bo.translate(x1 + 1.2, by - 1.7, cz + (rnd() - 0.5) * 12);
          br = new THREE.BoxGeometry(0.4, 1.5, 10);
          br.translate(x1 + 2.3, by - 0.9, cz + (rnd() - 0.5) * 12);
        }
        add(bo, C.trim);
        add(br, C.rail);
      }

      // a shop front at the street level
      var sside = (rnd() * 4) | 0;
      var sgn, sgl;
      var shop = C.shop[(rnd() * C.shop.length) | 0];
      var neon = C.neon[(rnd() * C.neon.length) | 0];
      if (sside === 0) {
        sgn = new THREE.BoxGeometry(13, 2.8, 0.6); sgn.translate(cx, 3.7, z0 - 0.7);
        sgl = new THREE.BoxGeometry(12, 2.1, 0.3); sgl.translate(cx, 3.7, z0 - 1.15);
      } else if (sside === 1) {
        sgn = new THREE.BoxGeometry(13, 2.8, 0.6); sgn.translate(cx, 3.7, z1 + 0.7);
        sgl = new THREE.BoxGeometry(12, 2.1, 0.3); sgl.translate(cx, 3.7, z1 + 1.15);
      } else if (sside === 2) {
        sgn = new THREE.BoxGeometry(0.6, 2.8, 13); sgn.translate(x0 - 0.7, 3.7, cz);
        sgl = new THREE.BoxGeometry(0.3, 2.1, 12); sgl.translate(x0 - 1.15, 3.7, cz);
      } else {
        sgn = new THREE.BoxGeometry(0.6, 2.8, 13); sgn.translate(x1 + 0.7, 3.7, cz);
        sgl = new THREE.BoxGeometry(0.3, 2.1, 12); sgl.translate(x1 + 1.15, 3.7, cz);
      }
      add(sgn, shop);
      shine(sgl, neon);

      // a neon strip up the wall
      if (rnd() < 0.4) {
        var ng = new THREE.BoxGeometry(1.1, h * 0.45, 1.1);
        ng.translate(cx + (rnd() - 0.5) * w * 0.6, h * 0.6, z0 - 0.9);
        shine(ng, neon);
      }

      // the usual clutter on the roof
      if (rnd() < 0.55) {
        bx(5, 1.6, 5, cx + (rnd() - 0.5) * (w - 8), h + 1.7, cz + (rnd() - 0.5) * (d - 8), C.trim);
        cyl(2.1, 3.2, cx + (rnd() - 0.5) * (w - 8), h + 4.1, cz + (rnd() - 0.5) * (d - 8), C.roof, 10);
      }
      if (tall && rnd() < 0.6) {
        bx(0.5, 8, 0.5, cx + (rnd() - 0.5) * w * 0.5, h + 4.9, cz + (rnd() - 0.5) * d * 0.5, C.rail);
      }
    }

    /* ---------------------------------------------------- the district ring */

    // the areas that have to stay clear: the map itself and the stubs that
    // lead off it
    var keep = [{ x0: map.x0, x1: map.x1, y0: map.y0, y1: map.y1 }];
    function stubRect(nx, ny, dir) {
      var v = DIRS[dir];
      var x0 = Math.min(nx, nx + v.x * CFG.STUB), x1 = Math.max(nx, nx + v.x * CFG.STUB);
      var y0 = Math.min(ny, ny + v.y * CFG.STUB), y1 = Math.max(ny, ny + v.y * CFG.STUB);
      var hx = v.x ? 0 : CFG.ROAD_W / 2, hy = v.y ? 0 : CFG.ROAD_W / 2;
      return { x0: x0 - hx, x1: x1 + hx, y0: y0 - hy, y1: y1 + hy };
    }
    for (var r = 0; r < CFG.ROWS; r++) {
      for (var c = 0; c < CFG.COLS; c++) {
        var nx = CFG.MARGIN_X + c * CFG.BLOCK_X;
        var ny = CFG.MARGIN_Y + r * CFG.BLOCK_Y;
        if (c === 0) keep.push(stubRect(nx, ny, 2));
        if (c === CFG.COLS - 1) keep.push(stubRect(nx, ny, 0));
        if (r === 0) keep.push(stubRect(nx, ny, 3));
        if (r === CFG.ROWS - 1) keep.push(stubRect(nx, ny, 1));
      }
    }
    function hits(x0, x1, z0, z1) {
      for (var i = 0; i < keep.length; i++) {
        var k = keep[i];
        if (x1 > k.x0 && x0 < k.x1 && z1 > k.y0 && z0 < k.y1) return true;
      }
      return false;
    }

    // a street of the district, cut off where the map begins
    function street(along, at, from, to) {
      var pieces = [];
      if (along === 'x') {
        if (at < map.y0 - 20 || at > map.y1 + 20) pieces.push([from, to]);
        else {
          pieces.push([from, map.x0 - 16]);
          pieces.push([map.x1 + 16, to]);
        }
      } else {
        if (at < map.x0 - 20 || at > map.x1 + 20) pieces.push([from, to]);
        else {
          pieces.push([from, map.y0 - 16]);
          pieces.push([map.y1 + 16, to]);
        }
      }
      for (var i = 0; i < pieces.length; i++) {
        var a = pieces[i][0], b = pieces[i][1];
        if (b - a < 6) continue;
        if (along === 'x') bx(b - a, 0.3, 24, (a + b) / 2, 0.15, at, C.street);
        else bx(24, 0.3, b - a, at, 0.15, (a + b) / 2, C.street);
      }
    }

    var gx = 100, gy = 92, inset = 12;
    var ox = -100, oy = -110;
    var x0g = ox, x1g = map.x1 + 120;
    var y0g = oy, y1g = map.y1 + 120;

    // the streets of the district
    for (var sx = x0g; sx <= x1g; sx += gx) street('z', sx, y0g, y1g);
    for (var sy = y0g; sy <= y1g; sy += gy) street('x', sy, x0g, x1g);

    // the buildings
    for (var bx0 = x0g; bx0 <= x1g; bx0 += gx) {
      for (var bz0 = y0g; bz0 <= y1g; bz0 += gy) {
        var px0 = bx0 + inset, px1 = bx0 + inset + 76;
        var pz0 = bz0 + inset, pz1 = bz0 + inset + 68;
        if (hits(px0, px1, pz0, pz1)) continue;
        var dx = Math.max(map.x0 - px1, px0 - map.x1, 0);
        var dz = Math.max(map.y0 - pz1, pz0 - map.y1, 0);
        var tall = Math.hypot(dx, dz) > 70;
        // the house stands a little back from the street
        var hx0 = px0 + rnd() * 9, hx1 = px1 - rnd() * 9;
        var hz0 = pz0 + rnd() * 9, hz1 = pz1 - rnd() * 9;
        if (rnd() < 0.35 && hx1 - hx0 > 50) {
          // two smaller houses side by side
          var mid = (hx0 + hx1) / 2;
          house(hx0, mid - 3, hz0, hz1, tall);
          house(mid + 3, hx1, hz0, hz1, tall);
        } else {
          house(hx0, hx1, hz0, hz1, tall);
        }
      }
    }

    /* -------------------------------------------------------- the map itself */

    for (var bi = 0; bi < opts.blocks.length; bi++) {
      var b = opts.blocks[bi];
      blockWalk(b);
      lampsAlong('x', b.y0 - 2, b.x0, b.x1, -1);
      lampsAlong('x', b.y1 + 2, b.x0, b.x1, 1);
      lampsAlong('z', b.x0 - 2, b.y0, b.y1, -1);
      lampsAlong('z', b.x1 + 2, b.y0, b.y1, 1);
    }

    outerWalks();
    var m2 = CFG.BOX / 2;
    lampsAlong('z', map.x0 - 2, CFG.MARGIN_Y + m2, CFG.MARGIN_Y + (CFG.ROWS - 1) * CFG.BLOCK_Y - m2, 1);
    lampsAlong('z', map.x1 + 2, CFG.MARGIN_Y + m2, CFG.MARGIN_Y + (CFG.ROWS - 1) * CFG.BLOCK_Y - m2, -1);
    for (var c2 = 0; c2 < CFG.COLS - 1; c2++) {
      var ax2 = CFG.MARGIN_X + c2 * CFG.BLOCK_X + m2;
      var bx3 = CFG.MARGIN_X + (c2 + 1) * CFG.BLOCK_X - m2;
      lampsAlong('x', map.y0 - 2, ax2, bx3, -1);
      lampsAlong('x', map.y1 + 2, ax2, bx3, 1);
    }

    return { parts: parts, glow: glow, pools: pools };
  }

  return { build: build };
})();
