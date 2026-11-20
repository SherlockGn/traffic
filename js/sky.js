/* The sky over the map and the weather in it.

   A dome with a gradient that follows the time of day, stars and a moon
   after dark, and rain that falls when the weather turns.  The rain follows
   the camera, so it is always around the part of the map that is on screen. */
var Sky = (function () {

  var SKY = {
    day: { top: 0x2f5c96, horizon: 0x86adD2, bottom: 0x121820 },
    dayRain: { top: 0x46525f, horizon: 0x66727e, bottom: 0x161a20 },
    night: { top: 0x05080f, horizon: 0x121c33, bottom: 0x04060a },
    nightRain: { top: 0x0a0e14, horizon: 0x161d28, bottom: 0x07090d }
  };

  var RAIN = 900;      // the number of drops
  var RAIN_H = 260;    // how high the column of rain is
  var RAIN_R = 340;    // how wide around the camera it falls

  function rnd(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function create(scene) {
    var random = rnd(4242);
    var night = false;
    var rain = false;

    /* --------------------------------------------------------------- the dome */

    var domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(SKY.day.top) },
        horizonColor: { value: new THREE.Color(SKY.day.horizon) },
        bottomColor: { value: new THREE.Color(SKY.day.bottom) }
      },
      vertexShader: [
        'varying vec3 vDir;',
        'void main() {',
        '  vDir = normalize(position);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 topColor;',
        'uniform vec3 horizonColor;',
        'uniform vec3 bottomColor;',
        'varying vec3 vDir;',
        'void main() {',
        '  float h = vDir.y;',
        '  vec3 c = mix(bottomColor, horizonColor, smoothstep(-0.30, 0.02, h));',
        '  c = mix(c, topColor, smoothstep(0.02, 0.62, h));',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    });
    var dome = new THREE.Mesh(new THREE.SphereGeometry(2600, 24, 16), domeMat);
    dome.frustumCulled = false;
    dome.renderOrder = -1;
    scene.add(dome);

    /* ------------------------------------------------------ stars and the moon */

    var starPos = [];
    for (var i = 0; i < 520; i++) {
      var a = random() * Math.PI * 2;
      var e = Math.acos(random() * 0.94);
      var r = 2300;
      starPos.push(
        Math.sin(e) * Math.cos(a) * r,
        Math.cos(e) * r,
        Math.sin(e) * Math.sin(a) * r
      );
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    var stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xe4ecff, size: 5, sizeAttenuation: false,
      transparent: true, opacity: 0.85, depthWrite: false, fog: false
    }));
    stars.frustumCulled = false;
    stars.visible = false;
    scene.add(stars);

    var moon = new THREE.Mesh(
      new THREE.SphereGeometry(46, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf6f2e2, fog: false })
    );
    moon.position.set(-1500, 1250, -1750);
    moon.visible = false;
    scene.add(moon);

    var moonGlow = new THREE.Mesh(
      new THREE.CircleGeometry(130, 24),
      new THREE.MeshBasicMaterial({
        color: 0xbfd0f0, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      })
    );
    moonGlow.position.copy(moon.position);
    moonGlow.lookAt(0, 0, 0);
    moonGlow.visible = false;
    scene.add(moonGlow);

    /* ------------------------------------------------------------------ rain */

    var rainPos = new Float32Array(RAIN * 6);
    var rainY = new Float32Array(RAIN);
    for (var d = 0; d < RAIN; d++) {
      var x = (random() - 0.5) * RAIN_R * 2;
      var z = (random() - 0.5) * RAIN_R * 2;
      var y = random() * RAIN_H;
      rainY[d] = y;
      var o = d * 6;
      rainPos[o] = x; rainPos[o + 1] = y; rainPos[o + 2] = z;
      rainPos[o + 3] = x + 0.7; rainPos[o + 4] = y - 7; rainPos[o + 5] = z;
    }
    var rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    var rainMesh = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({
      color: 0xa9c4d8, transparent: true, opacity: 0.5, depthWrite: false, fog: false
    }));
    rainMesh.frustumCulled = false;
    rainMesh.visible = false;
    scene.add(rainMesh);

    /* ------------------------------------------------------------- the look */

    function apply() {
      var look = night ? (rain ? SKY.nightRain : SKY.night) : (rain ? SKY.dayRain : SKY.day);
      domeMat.uniforms.topColor.value.setHex(look.top);
      domeMat.uniforms.horizonColor.value.setHex(look.horizon);
      domeMat.uniforms.bottomColor.value.setHex(look.bottom);
      stars.visible = night && !rain;
      moon.visible = night && !rain;
      moonGlow.visible = night && !rain;
      rainMesh.visible = rain;
    }

    apply();

    return {
      setNight: function (on) {
        night = !!on;
        apply();
      },
      setRain: function (on) {
        rain = !!on;
        apply();
      },
      // the rain follows the part of the map that is on screen
      update: function (dt, cx, cz) {
        if (!rain) return;
        rainMesh.position.set(cx, 0, cz);
        var fall = 150 * dt;
        var pos = rainGeo.attributes.position.array;
        for (var i = 0; i < RAIN; i++) {
          var y = rainY[i] - fall;
          if (y < 0) y += RAIN_H;
          rainY[i] = y;
          var o = i * 6;
          pos[o + 1] = y;
          pos[o + 4] = y - 7;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
    };
  }

  return { create: create };
})();
