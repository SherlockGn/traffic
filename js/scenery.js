/* Scenery for the blocks between the roads.  Every park gets a lawn, but
   two of the blocks get something else: one turns into a beach with a game
   of volleyball, the other into a fairground with a carousel, a big wheel,
   a tea cup ride and a little train.

   Everything that stands still is merged into the scenery mesh.  Everything
   that moves is handed back as its own object, so the render loop can drive
   it. */
var Scenery = (function () {

  var BEACH = {
    sand: 0xd7c28c,
    court: 0xc8b177,
    sea: 0x2f86ab,
    deep: 0x1d6285,
    trunk: 0x8a6a44,
    leaf: 0x3f8a46,
    post: 0x8d939b,
    pole: 0xa8aeb6,
    net: 0xe8eff4
  };

  var FUN = {
    ground: 0x474d56,
    plaza: 0x5c636d,
    sleeper: 0x6d5339,
    rail: 0x9b8a70,
    cream: 0xf3ecda,
    red: 0xd94f3d,
    blue: 0x3f7fc9,
    pink: 0xe87ba8,
    green: 0x4fae63,
    yellow: 0xf2c94c,
    purple: 0x9a6fd0,
    steel: 0x9aa5b1,
    dark: 0x2b3038,
    gold: 0xe8b64c,
    wood: 0x8a5a3b
  };

  // the colours the rides are painted in
  var FAIR_COLORS = [FUN.red, FUN.yellow, FUN.blue, FUN.green, FUN.pink, FUN.purple];

  function mat(hex, rough) {
    return new THREE.MeshStandardMaterial({
      color: hex, roughness: rough === undefined ? 0.7 : rough
    });
  }

  /* A patch of ground with a wandering edge, used for the lagoon.  The
     triangles are wound by hand, so the face of the patch looks up. */
  function blobGeo(cx, cz, rx, rz, seed, y) {
    var n = 30;
    var pos = [];
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2;
      var wob = 1 + 0.14 * Math.sin(a * 3 + seed) + 0.08 * Math.sin(a * 5 - seed * 1.7);
      pos.push(cx + Math.cos(a) * rx * wob, y, cz + Math.sin(a) * rz * wob);
    }
    pos.push(cx, y, cz);
    var idx = [];
    for (i = 0; i < n; i++) {
      idx.push(n, (i + 1) % n, i);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* ------------------------------------------------------------- beach */

  function beach(api, x0, x1, y0, y1) {
    var parts = [], meshes = [];
    var rnd = api.rnd;

    function add(geo, hex) { parts.push({ geo: geo, color: api.rgb(hex) }); }
    function box(w, h, d, x, y, z, hex, rot) {
      var g = new THREE.BoxGeometry(w, h, d);
      if (rot) g.rotateZ(rot);
      g.translate(x, y, z);
      add(g, hex);
    }
    function cyl(r, h, x, y, z, hex, seg) {
      var g = new THREE.CylinderGeometry(r, r, h, seg || 10);
      g.translate(x, y, z);
      add(g, hex);
    }

    var w = x1 - x0, d = y1 - y0;
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    var G = 0.4;                       // the height of the sand

    // the sand
    box(w, 0.5, d, mx, G - 0.25, my, BEACH.sand);

    // the lagoon, with a shore that wanders
    var lx = x0 + w * 0.25, lz = my + 6;
    add(blobGeo(lx, lz, 34, 41, 1.3, G + 0.04), BEACH.deep);
    add(blobGeo(lx, lz, 31, 38, 1.3, G + 0.06), BEACH.sea);

    // the volleyball court
    var cx = x0 + w * 0.68, cz = my - 6;
    box(34, 0.04, 20, cx, G + 0.02, cz, BEACH.court);
    cyl(0.5, 9, cx - 11, G + 4.5, cz, BEACH.post, 8);
    cyl(0.5, 9, cx + 11, G + 4.5, cz, BEACH.post, 8);
    box(22, 0.5, 0.3, cx, G + 8.2, cz, BEACH.post);

    // the net itself, thin enough to see the court through
    var net = new THREE.Mesh(
      new THREE.BoxGeometry(22, 6.4, 0.15),
      new THREE.MeshStandardMaterial({
        color: BEACH.net, transparent: true, opacity: 0.4, roughness: 0.9
      })
    );
    net.position.set(cx, G + 5.1, cz);
    net.castShadow = true;
    meshes.push(net);

    // the ball, arcing over the net
    var ballGeo = api.merge([
      { geo: ballWedge(0.0, Math.PI * 2 / 3, 0xf6f4ec), color: api.rgb(0xf6f4ec) },
      { geo: ballWedge(Math.PI * 2 / 3, Math.PI * 2 / 3, FUN.blue), color: api.rgb(FUN.blue) },
      { geo: ballWedge(Math.PI * 4 / 3, Math.PI * 2 / 3, FUN.red), color: api.rgb(FUN.red) }
    ]);
    var ball = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.55
    }));
    ball.castShadow = true;
    meshes.push(ball);

    // palm trees along the shore
    for (var i = 0; i < 4; i++) {
      var pa = i / 4 * Math.PI * 2 + 0.6;
      palm(lx + Math.cos(pa) * 40, lz + Math.sin(pa) * 46, G);
    }
    // a couple more by the court
    palm(cx - 26, cz + 26, G);
    palm(cx + 30, cz - 22, G);

    // parasols, towels and a deck chair
    for (i = 0; i < 4; i++) {
      parasol(cx - 34 + i * 22, cz + (i % 2 ? 20 : -20), G);
    }
    var towel = [0xf0ece0, 0xe87f5f, 0x5f9fd8, 0xf2c94c];
    for (i = 0; i < 4; i++) {
      var tx = cx - 30 + rnd() * 60, tz = cz - 30 + rnd() * 60;
      box(9, 0.2, 5, tx, G + 0.1, tz, towel[(rnd() * towel.length) | 0], rnd() * 0.8 - 0.4);
    }
    chair(cx + 18, cz + 12, G);

    function palm(px, pz, ground) {
      var h = 11 + rnd() * 3;
      var lean = (rnd() - 0.5) * 4;
      var seg = 5, th = h / seg;
      for (var s = 0; s < seg; s++) {
        var t = s / seg;
        var g = new THREE.CylinderGeometry(0.75 - t * 0.3, 0.95 - t * 0.3, th + 0.15, 7);
        g.translate(px + lean * t * t, ground + th * (s + 0.5), pz);
        add(g, BEACH.trunk);
      }
      var top = ground + h;
      for (var f = 0; f < 7; f++) {
        var fr = new THREE.BoxGeometry(0.8, 0.25, 8.5);
        fr.translate(0, 0, 4.2);
        fr.rotateX(0.34);
        fr.rotateY(f / 7 * Math.PI * 2);
        fr.translate(px + lean, top, pz);
        add(fr, BEACH.leaf);
      }
    }

    function parasol(px, pz, ground) {
      cyl(0.28, 6.4, px, ground + 3.2, pz, BEACH.pole, 8);
      for (var s = 0; s < 8; s++) {
        var g = new THREE.ConeGeometry(4.4, 2.6, 3, 1, true, s / 8 * Math.PI * 2, Math.PI / 4);
        g.translate(px, ground + 6.2, pz);
        add(g, s % 2 ? 0xf5f2e8 : FUN.red);
      }
    }

    function chair(px, pz, ground) {
      var g = new THREE.BoxGeometry(6, 0.4, 2.4);
      g.translate(px, ground + 1.6, pz);
      add(g, 0xf5f2e8);
      var back = new THREE.BoxGeometry(6, 0.4, 2.4);
      back.rotateX(-0.9);
      back.translate(px, ground + 3.0, pz - 1.4);
      add(back, 0xf5f2e8);
      for (var s = 0; s < 2; s++) {
        var leg = new THREE.BoxGeometry(0.4, 1.6, 0.4);
        leg.translate(px + (s ? 2.4 : -2.4), ground + 0.8, pz);
        add(leg, FUN.wood);
      }
    }

    function ballWedge(start, len, hex) {
      var g = new THREE.SphereGeometry(1.3, 12, 10, start, len);
      return g;
    }

    return {
      parts: parts,
      meshes: meshes,
      update: function (t) {
        // the ball goes over the net and comes back
        var u = (t % 1.9) / 1.9;
        var side = u < 0.5 ? 0 : 1;
        var u2 = side ? (u - 0.5) * 2 : u * 2;
        var dir = side ? 1 : -1;
        ball.position.set(
          cx + dir * (2 + u2 * 20),
          G + 1.2 + Math.sin(u2 * Math.PI) * 7,
          cz + Math.sin(u * 3.1) * 1.5
        );
        ball.rotation.set(t * 3.1, t * 2.2, 0);
      }
    };
  }

  /* -------------------------------------------------------- fairground */

  function fair(api, x0, x1, y0, y1) {
    var parts = [], meshes = [];
    var rnd = api.rnd;

    function add(geo, hex) { parts.push({ geo: geo, color: api.rgb(hex) }); }
    function box(w, h, d, x, y, z, hex, rot) {
      var g = new THREE.BoxGeometry(w, h, d);
      if (rot) g.rotateZ(rot);
      g.translate(x, y, z);
      add(g, hex);
    }

    var w = x1 - x0, d = y1 - y0;
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    var G = 0.4;

    // the ground of the fair
    box(w, 0.5, d, mx, G - 0.25, my, FUN.ground);

    /* The little train runs round a loop that goes through the whole
       fairground, so the track is laid out first and the rides stand
       inside it. */
    var TR = { rx: 82, rz: 42 };
    var N = 72;
    for (var i = 0; i < N; i++) {
      var a = i / N * Math.PI * 2;
      var px = mx + Math.cos(a) * TR.rx;
      var pz = my + Math.sin(a) * TR.rz;
      var ang = Math.atan2(Math.cos(a) * TR.rz, -Math.sin(a) * TR.rx);
      var sl = new THREE.BoxGeometry(4.6, 0.35, 6.4);
      sl.rotateY(-ang);
      sl.translate(px, G + 0.2, pz);
      add(sl, FUN.sleeper);
      for (var s = -1; s <= 1; s += 2) {
        var rl = new THREE.BoxGeometry(4.6, 0.4, 0.45);
        rl.rotateY(-ang);
        rl.translate(
          px + Math.cos(ang) * s * 2.1,
          G + 0.5,
          pz - Math.sin(ang) * s * 2.1
        );
        add(rl, FUN.rail);
      }
    }

    var carousel = carouselRide(mx - 44, my - 6);
    var wheel = wheelRide(mx + 44, my - 8);
    var cups = cupRide(mx - 4, my + 18);
    var train = trainRide(mx, my, TR.rx, TR.rz);

    // a row of lamp posts along the fence line
    for (i = 0; i < 8; i++) {
      var fx = x0 + 14 + (i % 4) * ((w - 28) / 3);
      var fz = i < 4 ? y0 + 12 : y1 - 12;
      var post = new THREE.CylinderGeometry(0.4, 0.55, 9, 6);
      post.translate(fx, G + 4.5, fz);
      add(post, FUN.steel);
      var bulb = new THREE.SphereGeometry(1.1, 10, 8);
      bulb.translate(fx, G + 9.6, fz);
      add(bulb, FUN.yellow);
    }

    /* -------------------------------------------------------- carousel */

    function carouselRide(cx, cz) {
      var g = new THREE.Group();
      g.position.set(cx, G, cz);

      var plat = new THREE.Mesh(new THREE.CylinderGeometry(19, 19.6, 1.2, 28), mat(FUN.cream));
      plat.position.y = 0.6;
      plat.castShadow = true; plat.receiveShadow = true;
      g.add(plat);

      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 16, 12), mat(FUN.gold));
      pole.position.y = 8.6;
      pole.castShadow = true;
      g.add(pole);

      // a canopy with painted stripes.  It is kept smaller than the
      // platform, so the horses stand out beyond its edge.
      for (var s = 0; s < 12; s++) {
        var wedge = new THREE.Mesh(
          new THREE.ConeGeometry(16.5, 6.6, 3, 1, true, s / 12 * Math.PI * 2, Math.PI / 6),
          mat(s % 2 ? FUN.red : FUN.cream)
        );
        wedge.position.y = 15.4;
        wedge.castShadow = true;
        g.add(wedge);
      }
      var rim = new THREE.Mesh(new THREE.TorusGeometry(16.4, 0.55, 6, 32), mat(FUN.gold));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 12;
      g.add(rim);

      // the horses, each on a pole that goes up and down
      var horses = [];
      for (var i = 0; i < 6; i++) {
        var holder = new THREE.Group();
        var a = i / 6 * Math.PI * 2;
        holder.position.set(Math.cos(a) * 14.5, 1.2, Math.sin(a) * 14.5);
        holder.rotation.y = -a + Math.PI / 2;
        var horse = new THREE.Mesh(horseGeo(i), new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.65
        }));
        horse.castShadow = true;
        holder.add(horse);
        g.add(holder);
        horses.push({ holder: holder, phase: i / 6 * Math.PI * 2 });
      }

      meshes.push(g);
      return {
        update: function (t) {
          g.rotation.y = t * 0.32;
          for (var i = 0; i < horses.length; i++) {
            var h = horses[i];
            h.holder.position.y = 1.2 + Math.sin(t * 2.1 + h.phase) * 1.8;
          }
        }
      };
    }

    function horseGeo(seed) {
      var p = [];
      var coat = [0xf5f1e4, 0xe6b49b, 0xd8c19a][seed % 3];
      function b(w, h, d, x, y, z, hex, rot) {
        var g = new THREE.BoxGeometry(w, h, d);
        if (rot) g.rotateZ(rot);
        g.translate(x, y, z);
        p.push({ geo: g, color: api.rgb(hex) });
      }
      b(4.4, 1.8, 1.4, 0, 2.9, 0, coat);
      b(1.6, 2.4, 1.1, 2.1, 3.8, 0, coat, -0.55);
      b(2.0, 1.1, 1.0, 3.2, 4.6, 0, coat);
      b(1.4, 0.5, 1.0, 2.9, 5.1, 0, FUN.dark);
      b(4.2, 0.5, 0.6, -1.6, 3.6, 0, coat, 0.5);
      b(0.5, 2.1, 0.5, 1.5, 1.1, 0.45, coat, 0.2);
      b(0.5, 2.1, 0.5, 1.5, 1.1, -0.45, coat, -0.2);
      b(0.5, 2.1, 0.5, -1.5, 1.1, 0.45, coat, -0.2);
      b(0.5, 2.1, 0.5, -1.5, 1.1, -0.45, coat, 0.2);
      b(0.3, 9, 0.3, 0, 4.5, 0, FUN.gold);
      return api.merge(p);
    }

    /* ------------------------------------------------------ big wheel */

    function wheelRide(cx, cz) {
      var root = new THREE.Group();
      root.position.set(cx, G, cz);
      root.rotation.y = 0.72;

      var R = 24, AX = 30;
      // the legs it stands on
      for (var s = -1; s <= 1; s += 2) {
        for (var t = -1; t <= 1; t += 2) {
          var leg = new THREE.Mesh(new THREE.BoxGeometry(1.4, AX + 2, 1.4), mat(FUN.steel));
          leg.position.set(s * 3.4, (AX + 2) / 2, t * 3.4);
          leg.castShadow = true;
          root.add(leg);
        }
        var brace = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 9), mat(FUN.steel));
        brace.position.set(s * 3.4, AX * 0.55, 0);
        root.add(brace);
      }

      var pivot = new THREE.Group();
      pivot.position.y = AX;
      root.add(pivot);

      // the two rims
      for (s = -1; s <= 1; s += 2) {
        var rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 6, 40), mat(FUN.steel));
        rim.rotation.y = Math.PI / 2;
        rim.position.x = s * 2.2;
        rim.castShadow = true;
        pivot.add(rim);
      }
      // the spokes
      for (var i = 0; i < 12; i++) {
        var a = i / 12 * Math.PI * 2;
        var sp = new THREE.Mesh(new THREE.BoxGeometry(0.35, R, 0.35), mat(FUN.steel));
        sp.rotation.x = a;
        sp.position.set(0, Math.cos(a) * R / 2, Math.sin(a) * R / 2);
        pivot.add(sp);
      }
      // the cabins, hanging from the rim
      var cabins = [];
      for (i = 0; i < 12; i++) {
        a = i / 12 * Math.PI * 2;
        var hold = new THREE.Group();
        hold.position.set(0, Math.cos(a) * R, Math.sin(a) * R);
        var cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), mat(FAIR_COLORS[i % 6]));
        cabin.position.y = -2.2;
        cabin.castShadow = true;
        hold.add(cabin);
        pivot.add(hold);
        cabins.push(hold);
      }

      meshes.push(root);
      return {
        update: function (t) {
          pivot.rotation.x = t * 0.26;
          for (var i = 0; i < cabins.length; i++) {
            cabins[i].rotation.x = -pivot.rotation.x;
          }
        }
      };
    }

    /* ------------------------------------------------------ tea cups */

    function cupRide(cx, cz) {
      var g = new THREE.Group();
      g.position.set(cx, G, cz);

      var plat = new THREE.Mesh(new THREE.CylinderGeometry(15, 15.6, 1, 26), mat(FUN.plaza));
      plat.position.y = 0.5;
      plat.receiveShadow = true;
      g.add(plat);

      var cups = [];
      for (var i = 0; i < 4; i++) {
        var holder = new THREE.Group();
        var a = i / 4 * Math.PI * 2;
        holder.position.set(Math.cos(a) * 8, 1, Math.sin(a) * 8);
        var cup = new THREE.Group();
        var body = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 3.2, 4.4, 18), mat(FAIR_COLORS[i]));
        body.position.y = 2.3;
        body.castShadow = true;
        cup.add(body);
        var rim = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.35, 6, 18), mat(FUN.cream));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 4.5;
        cup.add(rim);
        var handle = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.35, 6, 16), mat(FUN.cream));
        handle.rotation.y = Math.PI / 2;
        handle.position.set(4.2, 2.8, 0);
        cup.add(handle);
        var wheel = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 12), mat(FUN.dark));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(0, 1.1, 3.6);
        cup.add(wheel);
        holder.add(cup);
        g.add(holder);
        cups.push(cup);
      }

      meshes.push(g);
      return {
        update: function (t) {
          g.rotation.y = t * 0.22;
          for (var i = 0; i < cups.length; i++) cups[i].rotation.y = t * 1.7 + i;
        }
      };
    }

    /* ---------------------------------------------------------- train */

    function trainRide(cx, cz, rx, rz) {
      var units = [];
      for (var i = 0; i < 3; i++) {
        var g = new THREE.Group();
        var mesh = new THREE.Mesh(i === 0 ? locoGeo() : coachGeo(), new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.6
        }));
        mesh.castShadow = true;
        g.add(mesh);
        meshes.push(g);
        units.push(g);
      }
      return {
        update: function (t) {
          for (var i = 0; i < units.length; i++) {
            var a = t * 0.26 - i * 0.16;
            var px = cx + Math.cos(a) * rx;
            var pz = cz + Math.sin(a) * rz;
            units[i].position.set(px, G + 0.7, pz);
            units[i].rotation.y = -Math.atan2(Math.cos(a) * rz, -Math.sin(a) * rx);
          }
        }
      };
    }

    function locoGeo() {
      var p = [];
      function b(w, h, d, x, y, z, hex, rot) {
        var g = new THREE.BoxGeometry(w, h, d);
        if (rot) g.rotateZ(rot);
        g.translate(x, y, z);
        p.push({ geo: g, color: api.rgb(hex) });
      }
      b(11, 3.2, 4.4, 0, 2.6, 0, FUN.red);
      b(4.6, 3.6, 4.2, -2.6, 4.6, 0, FUN.red);
      b(4.2, 1.6, 4.3, -2.6, 5.6, 0, FUN.cream);
      b(2, 2.6, 2, 3.4, 5, 0, FUN.dark);
      b(4.4, 1.4, 4.4, 1.2, 4.4, 0, FUN.yellow);
      for (var s = -1; s <= 1; s += 2) {
        for (var t = -1; t <= 1; t += 2) {
          var wheel = new THREE.CylinderGeometry(1.5, 1.5, 0.8, 12);
          wheel.rotateX(Math.PI / 2);
          wheel.translate(t * 3.4, 1.5, s * 2.2);
          p.push({ geo: wheel, color: api.rgb(FUN.dark) });
        }
      }
      return api.merge(p);
    }

    function coachGeo() {
      var p = [];
      function b(w, h, d, x, y, z, hex) {
        var g = new THREE.BoxGeometry(w, h, d);
        g.translate(x, y, z);
        p.push({ geo: g, color: api.rgb(hex) });
      }
      b(9, 1, 4.4, 0, 2.2, 0, FUN.wood);
      b(9, 2.4, 0.6, 0, 3.2, 2.1, FUN.green);
      b(9, 2.4, 0.6, 0, 3.2, -2.1, FUN.green);
      b(0.6, 2.4, 4.4, 4.4, 3.2, 0, FUN.green);
      b(0.6, 2.4, 4.4, -4.4, 3.2, 0, FUN.green);
      for (var s = -1; s <= 1; s += 2) {
        for (var t = -1; t <= 1; t += 2) {
          var wheel = new THREE.CylinderGeometry(1.3, 1.3, 0.7, 12);
          wheel.rotateX(Math.PI / 2);
          wheel.translate(t * 3, 1.3, s * 2.2);
          p.push({ geo: wheel, color: api.rgb(FUN.dark) });
        }
      }
      return api.merge(p);
    }

    return {
      parts: parts,
      meshes: meshes,
      update: function (t) {
        carousel.update(t);
        wheel.update(t);
        cups.update(t);
        train.update(t);
      }
    };
  }

  return { beach: beach, fair: fair };
})();
