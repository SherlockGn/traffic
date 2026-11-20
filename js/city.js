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
    lit: [0xffd9a0, 0xfff0d6, 0xd6e8ff, 0xffc98a],
    stone: 0x8e8a80,      // the bridges and the walls of the park
    water: 0x1d4256,
    lawn: 0x2b4432,
    foliage: 0x2f5c38,
    fest: [0xe2514f, 0xf2c14e, 0x5aa9e6, 0x6fbf73, 0xe08ac0, 0xf28c38],
    ball: [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xff9ff3]
  };

  function build(api, opts) {
    var parts = [], glow = [], pools = [];
    var rnd = api.rnd;
    var map = opts.map;

    // the grid of the district and the canal that runs along its west side
    var gx = 100, gy = 92, inset = 12;
    var ox = -100, oy = -110;
    var x0g = ox, x1g = map.x1 + 120;
    var y0g = oy, y1g = map.y1 + 120;
    var CANAL_X = ox;
    var CANAL_W = 24;
    // how far the roads that lead off the map reach into the city
    var STUB_END = { 0: 588, 1: 430, 2: CANAL_X + CANAL_W / 2, 3: -98 };

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
    // a flat triangle, used for the flags
    function tri(ax, ay, az, bx, by, bz, cx, cy, cz, hex) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([
        ax, ay, az, bx, by, bz, cx, cy, cz
      ], 3));
      g.setIndex([0, 1, 2]);
      g.computeVertexNormals();
      add(g, hex);
    }
    // a ball, for the balloons and the baubles of the tree
    function ball(x, y, z, r, hex) {
      var g = new THREE.IcosahedronGeometry(r, 1);
      g.translate(x, y, z);
      add(g, hex);
    }
    // a flat patch on the ground
    function disc(cx, cz, rx, rz, y, hex) {
      var g = new THREE.CircleGeometry(1, 20);
      g.scale(rx, rz, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(cx, y, cz);
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

    /* ------------------------------------------------------ street furniture

       The things that stand on the sidewalk: a bin, a post box, a phone box,
       a bike rack, a bench, a hydrant or the sign of a bus stop. */
    function furniture(x, z, kind) {
      if (kind === 0) {
        // a bin
        cyl(1.6, 3.2, x, 3.1, z, 0x3f4c42);
        cyl(1.8, 0.45, x, 4.9, z, 0x2f3a33);
      } else if (kind === 1) {
        // a post box
        bx(0.8, 1.4, 0.8, x, 2.2, z, 0x39414c);
        cyl(1.35, 3.4, x, 4.6, z, 0x8a3b3b);
        cyl(1.5, 0.5, x, 6.5, z, 0x6e2f2f);
      } else if (kind === 2) {
        // a phone box
        bx(3.4, 5, 3.2, x, 4.0, z, 0x2c3a46);
        bx(3.9, 0.5, 3.7, x, 6.7, z, 0x44505c);
        bx(2.4, 2.8, 0.2, x, 4.2, z - 1.6, 0x7fa0b4);
      } else if (kind === 3) {
        // a bike rack with a few bikes in it
        bx(0.4, 3.2, 0.4, x - 3, 3.1, z, 0x59616e);
        bx(0.4, 3.2, 0.4, x + 3, 3.1, z, 0x59616e);
        bx(6.4, 0.4, 0.4, x, 4.6, z, 0x59616e);
        for (var b = 0; b < 3; b++) {
          var bxx = x - 2 + b * 2;
          bx(0.22, 1.7, 0.22, bxx, 3.9, z, 0x8d949e);
          bx(1.8, 0.22, 0.22, bxx, 4.6, z, 0x8d949e);
          bx(0.22, 0.9, 0.22, bxx + 0.8, 2.9, z, 0x8d949e);
        }
      } else if (kind === 4) {
        // a bench
        bx(4.6, 0.35, 1.5, x, 3.4, z, 0x8a5a3b);
        bx(4.6, 1.3, 0.3, x, 4.0, z - 0.6, 0x8a5a3b);
        bx(0.35, 1.6, 1.4, x - 1.9, 2.3, z, 0x39414c);
        bx(0.35, 1.6, 1.4, x + 1.9, 2.3, z, 0x39414c);
      } else if (kind === 5) {
        // a hydrant
        cyl(0.8, 2.4, x, 2.7, z, 0x9c3b32);
        cyl(1.05, 0.45, x, 4.1, z, 0x7d3029);
        bx(1.7, 0.7, 0.7, x, 3.3, z, 0x9c3b32);
      } else {
        // the sign of a bus stop
        cyl(0.25, 6.4, x, 4.7, z, 0x59616e);
        bx(2.6, 2.2, 0.3, x, 6.9, z, 0x2f6b8a);
        bx(2.1, 1.5, 0.15, x, 6.8, z - 0.25, 0xd8dee6);
      }
    }

    /* ---------------------------------------------------------- the festival

       Bunting between the lamp posts, balloons tied to them and a wreath on
       some of them.  The trees in the parks get their stars as well. */
    function bunting(from, to, y, fixed, alongX) {
      var n = 9;
      var sag = 2.2;
      var prevA = null, prevY = 0;
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        var a = from + (to - from) * t;
        var yy = y - Math.sin(t * Math.PI) * sag;
        if (prevA !== null) {
          var seg = (to - from) / n;
          if (alongX) bx(seg, 0.16, 0.16, (a + prevA) / 2, (yy + prevY) / 2, fixed, 0x6a7078);
          else bx(0.16, 0.16, seg, fixed, (yy + prevY) / 2, (a + prevA) / 2, 0x6a7078);
        }
        if (i > 0 && i < n) {
          var col = C.fest[i % C.fest.length];
          if (alongX) tri(a - 1.2, yy, fixed, a + 1.2, yy, fixed, a, yy - 3.0, fixed, col);
          else tri(fixed, yy, a - 1.2, fixed, yy, a + 1.2, fixed, yy - 3.0, a, col);
        }
        prevA = a;
        prevY = yy;
      }
    }

    // a bunch of balloons tied to a post
    function balloons(x, z, y) {
      for (var i = 0; i < 4; i++) {
        var ux = x + (rnd() - 0.5) * 3.4;
        var uz = z + (rnd() - 0.5) * 3.4;
        var uy = y + 5 + rnd() * 3;
        ball(ux, uy, uz, 1.5, C.ball[(rnd() * C.ball.length) | 0]);
        bx(0.12, 4.5, 0.12, ux, uy - 2.6, uz, 0xb8bcc2);
      }
    }

    // a wreath on a lamp post
    function wreath(x, y, z) {
      var g = new THREE.TorusGeometry(1.5, 0.42, 6, 14);
      g.rotateY(Math.PI / 2);
      g.translate(x, y, z);
      add(g, 0x2f6b3a);
      ball(x, y + 1.5, z, 0.5, 0xd8321f);
    }

    // a christmas tree with a star on top
    function christmasTree(x, z, ground, scale) {
      var s = scale || 1;
      cyl(1.1 * s, 2 * s, x, ground + 1 * s, z, 0x5a432c);
      var tiers = 3;
      for (var i = 0; i < tiers; i++) {
        var r = (5.2 - i * 1.4) * s;
        var h = (7 - i * 0.8) * s;
        var g = new THREE.ConeGeometry(r, h, 9);
        g.translate(x, ground + (2.6 + i * 3.4) * s, z);
        add(g, C.foliage);
      }
      var top = ground + (2.6 + tiers * 3.4) * s;
      var star = new THREE.ConeGeometry(1.5 * s, 2.6 * s, 5);
      star.rotateY(0.6);
      star.translate(x, top, z);
      add(star, 0xffd166);
      for (var b = 0; b < 10; b++) {
        var a = rnd() * Math.PI * 2;
        var rr = (2 + rnd() * 3) * s;
        var yy = ground + (3 + rnd() * 8) * s;
        ball(x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr, 0.55 * s,
          C.fest[(rnd() * C.fest.length) | 0]);
      }
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
    // the road lies from it.  The things on the sidewalk stand between the
    // lamps, and the street is dressed for the festival.
    function lampsAlong(axis, fixed, from, to, dir) {
      var prev = null;
      var k = 0;
      for (var t = from + 16; t < to - 16; t += 44) {
        if (axis === 'x') lamp(t, fixed, 0, dir);
        else lamp(fixed, t, dir, 0);
        // the bunting from this lamp to the next one
        if (prev !== null && k % 2 === 0) {
          bunting(prev, t, 9.2, fixed, axis === 'x');
        }
        // every now and then the post gets a wreath or a bunch of balloons
        if (k % 3 === 1) {
          if (axis === 'x') wreath(t, 7.2, fixed);
          else wreath(fixed, 7.2, t);
        }
        if (k % 5 === 3) {
          if (axis === 'x') balloons(t + 3.5, fixed, 1.5);
          else balloons(fixed, t + 3.5, 1.5);
        }
        prev = t;
        k++;
      }
      for (var f = from + 38; f < to - 16; f += 44) {
        var kind = (rnd() * 7) | 0;
        if (axis === 'x') furniture(f, fixed, kind);
        else furniture(fixed, f, kind);
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
      var hw = CFG.ROAD_W / 2;
      var end = STUB_END[dir];
      if (dir === 0 || dir === 2) {
        return { x0: Math.min(nx, end), x1: Math.max(nx, end), y0: ny - hw, y1: ny + hw };
      }
      return { x0: nx - hw, x1: nx + hw, y0: Math.min(ny, end), y1: Math.max(ny, end) };
    }

    // the road that leads off the map and on into the city
    function stubRoad(nx, ny, dir) {
      var v = DIRS[dir];
      var end = STUB_END[dir];
      var start = dir === 0 ? nx + CFG.STUB : dir === 2 ? nx - CFG.STUB :
        dir === 1 ? ny + CFG.STUB : ny - CFG.STUB;
      var a = Math.min(start, end), b = Math.max(start, end);
      if (b - a < 2) return;
      if (dir === 0 || dir === 2) {
        bx(b - a, 0.3, CFG.ROAD_W, (a + b) / 2, 0.15, ny, C.street);
      } else {
        bx(CFG.ROAD_W, 0.3, b - a, nx, 0.15, (a + b) / 2, C.street);
      }
      // the west roads cross the canal on a bridge
      if (dir === 2) bridge(CANAL_X, ny, true);
    }
    for (var r = 0; r < CFG.ROWS; r++) {
      for (var c = 0; c < CFG.COLS; c++) {
        var nx = CFG.MARGIN_X + c * CFG.BLOCK_X;
        var ny = CFG.MARGIN_Y + r * CFG.BLOCK_Y;
        if (c === 0) { keep.push(stubRect(nx, ny, 2)); stubRoad(nx, ny, 2); }
        if (c === CFG.COLS - 1) { keep.push(stubRect(nx, ny, 0)); stubRoad(nx, ny, 0); }
        if (r === 0) { keep.push(stubRect(nx, ny, 3)); stubRoad(nx, ny, 3); }
        if (r === CFG.ROWS - 1) { keep.push(stubRect(nx, ny, 1)); stubRoad(nx, ny, 1); }
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

    // a little park in one of the blocks of the city: a lawn, a pond with a
    // fountain, trees and benches
    function districtPark(x0, x1, z0, z1) {
      var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      var w = x1 - x0, d = z1 - z0;
      bx(w, 0.5, d, cx, 0.25, cz, C.lawn);
      // the paths across the lawn
      bx(w - 12, 0.16, 9, cx, 0.58, cz, 0x605e53);
      bx(9, 0.16, d - 12, cx, 0.58, cz, 0x605e53);
      // the pond and the fountain in it
      disc(cx - w * 0.22, cz - d * 0.2, 16, 11, 0.56, 0x555b4d);
      disc(cx - w * 0.22, cz - d * 0.2, 13, 8.5, 0.6, C.water);
      cyl(4.2, 1.6, cx - w * 0.22, 1.2, cz - d * 0.2, C.stone, 14);
      cyl(3.4, 0.3, cx - w * 0.22, 2.1, cz - d * 0.2, 0x8fb8c8, 14);
      var jet = new THREE.ConeGeometry(1.6, 4.6, 8);
      jet.translate(cx - w * 0.22, 4.4, cz - d * 0.2);
      add(jet, 0xa9d6e6);
      // the trees
      for (var t = 0; t < 4; t++) {
        var ux = x0 + 12 + rnd() * (w - 24);
        var uz = z0 + 12 + rnd() * (d - 24);
        if (Math.abs(ux - cx) < 8 && Math.abs(uz - cz) < 8) continue;
        cyl(1.1, 5, ux, 2.9, uz, 0x4a3a2a);
        for (var b = 0; b < 3; b++) {
          var r = 4.6 - b * 0.9;
          ball(ux + (rnd() - 0.5) * 2.6, 8.4 - b * 1.5, uz + (rnd() - 0.5) * 2.6, r,
            C.foliage);
        }
      }
      // the benches and the lamps
      bx(7, 0.6, 2.4, cx + 14, 2, cz + 10, 0x8a5a3b);
      bx(0.8, 1.8, 2.2, cx + 11, 1, cz + 10, 0x39414c);
      bx(0.8, 1.8, 2.2, cx + 17, 1, cz + 10, 0x39414c);
      bx(7, 0.6, 2.4, cx - 10, 2, cz - 12, 0x8a5a3b);
      bx(0.8, 1.8, 2.2, cx - 13, 1, cz - 12, 0x39414c);
      bx(0.8, 1.8, 2.2, cx - 7, 1, cz - 12, 0x39414c);
      lamp(cx + 20, cz - 6, -1, 0);
      lamp(cx - 22, cz + 8, 1, 0);
      christmasTree(cx + 6, cz + 16, 0.5, 0.9);
    }

    // a stone bridge over the canal
    function bridge(cx, cz, alongX) {
      if (alongX) {
        bx(CANAL_W + 10, 0.3, CFG.ROAD_W, cx, 0.15, cz, C.street);
        bx(CANAL_W + 10, 1.3, 1.1, cx, 0.9, cz - CFG.ROAD_W / 2, C.stone);
        bx(CANAL_W + 10, 1.3, 1.1, cx, 0.9, cz + CFG.ROAD_W / 2, C.stone);
        bx(3.5, 3.4, CFG.ROAD_W, cx - CANAL_W / 2 - 1, 1.7, cz, C.stone);
        bx(3.5, 3.4, CFG.ROAD_W, cx + CANAL_W / 2 + 1, 1.7, cz, C.stone);
      } else {
        bx(CFG.ROAD_W, 0.3, CANAL_W + 10, cx, 0.15, cz, C.street);
        bx(1.1, 1.3, CANAL_W + 10, cx - CFG.ROAD_W / 2, 0.9, cz, C.stone);
        bx(1.1, 1.3, CANAL_W + 10, cx + CFG.ROAD_W / 2, 0.9, cz, C.stone);
        bx(CFG.ROAD_W, 3.4, 3.5, cx, 1.7, cz - CANAL_W / 2 - 1, C.stone);
        bx(CFG.ROAD_W, 3.4, 3.5, cx, 1.7, cz + CANAL_W / 2 + 1, C.stone);
      }
    }

    // the water and the banks of the canal
    function canal() {
      bx(CANAL_W, 0.24, y1g - y0g, CANAL_X, 0.12, (y0g + y1g) / 2, C.water);
      bx(2.5, 1.6, y1g - y0g, CANAL_X - CANAL_W / 2 - 1, 0.8, (y0g + y1g) / 2, C.stone);
      bx(2.5, 1.6, y1g - y0g, CANAL_X + CANAL_W / 2 + 1, 0.8, (y0g + y1g) / 2, C.stone);
    }

    // the streets of the district
    for (var sx = x0g + gx; sx <= x1g; sx += gx) street('z', sx, y0g, y1g);
    for (var sy = y0g; sy <= y1g; sy += gy) {
      // the street is cut in two by the canal, and a bridge takes its place
      street('x', sy, x0g, CANAL_X - CANAL_W / 2 - 5);
      street('x', sy, CANAL_X + CANAL_W / 2 + 5, x1g);
      bridge(CANAL_X, sy, true);
    }
    canal();

    // the buildings
    for (var bx0 = x0g; bx0 <= x1g; bx0 += gx) {
      for (var bz0 = y0g; bz0 <= y1g; bz0 += gy) {
        var px0 = bx0 + inset, px1 = bx0 + inset + 76;
        var pz0 = bz0 + inset, pz1 = bz0 + inset + 68;
        if (hits(px0, px1, pz0, pz1)) continue;
        // one block of the city is a little park
        if (bx0 === 200 && bz0 === 442) {
          districtPark(px0, px1, pz0, pz1);
          continue;
        }
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
