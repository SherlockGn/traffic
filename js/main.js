'use strict';

(function () {
  var canvas = document.getElementById('scene');
  var stage = canvas.parentElement;
  var tooltip = document.getElementById('tooltip');

  var scene3d = Scene3D.create(canvas);

  var net = new Network();
  var sim = new Simulation(net);
  var hoverNode = null;
  var running = true;

  var chosenType = 'sedan';
  var chosenColor = CAR_COLORS[0];

  function carLabel(key) {
    for (var i = 0; i < CAR_CATALOG.length; i++) {
      if (CAR_CATALOG[i].key === key) return CAR_CATALOG[i].label;
    }
    return '汽车';
  }

  var el = {
    modeAuto: document.getElementById('mode-auto'),
    modeManual: document.getElementById('mode-manual'),
    hint: document.getElementById('mode-hint'),
    green: document.getElementById('in-green'),
    yellow: document.getElementById('in-yellow'),
    spawn: document.getElementById('in-spawn'),
    cars: document.getElementById('in-cars'),
    valGreen: document.getElementById('val-green'),
    valYellow: document.getElementById('val-yellow'),
    valSpawn: document.getElementById('val-spawn'),
    valCars: document.getElementById('val-cars'),
    pause: document.getElementById('btn-pause'),
    reset: document.getElementById('btn-reset'),
    night: document.getElementById('btn-night'),
    rain: document.getElementById('btn-rain'),
    closed: document.getElementById('in-closed'),
    typeBox: document.getElementById('car-type'),
    colorBox: document.getElementById('car-colors'),
    addCar: document.getElementById('btn-add-car'),
    addHint: document.getElementById('add-hint'),
    stCars: document.getElementById('st-cars'),
    stSpeed: document.getElementById('st-speed'),
    stWait: document.getElementById('st-wait'),
    stFlow: document.getElementById('st-flow')
  };

  function applySettings() {
    sim.greenTime = +el.green.value;
    sim.yellowTime = +el.yellow.value;
    sim.spawnRate = +el.spawn.value;
    el.valGreen.textContent = sim.greenTime + 's';
    el.valYellow.textContent = sim.yellowTime + 's';
    el.valSpawn.textContent = sim.spawnRate + '/s';
    el.valCars.textContent = el.cars.value;
  }

  function setMode(auto) {
    sim.autoMode = auto;
    for (var i = 0; i < net.nodes.length; i++) {
      var light = net.nodes[i].light;
      if (auto) light.manual = false;
      else light.beginManual();
    }
    el.modeAuto.classList.toggle('active', auto);
    el.modeManual.classList.toggle('active', !auto);
    el.hint.textContent = auto
      ? '自动模式：信号灯按周期自动切换'
      : '手动模式：左键点击信号灯切换相位，右键切换全红';
  }

  function rebuild(populate) {
    net = new Network();
    sim = new Simulation(net);
    sim.greenTime = +el.green.value;
    sim.yellowTime = +el.yellow.value;
    sim.spawnRate = +el.spawn.value;
    sim.autoMode = el.modeAuto.classList.contains('active');
    sim.setClosed(el.closed.checked);
    if (populate) sim.populate(+el.cars.value);
    scene3d.build(net);
  }

  /* ------------------------------------------------------------ interaction */

  var drag = null;
  var pointers = {};
  var pinch = null;
  var holdTimer = null;
  var holdFired = false;

  function fingerDistance() {
    var ids = Object.keys(pointers);
    if (ids.length < 2) return 0;
    var a = pointers[ids[0]];
    var b = pointers[ids[1]];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  canvas.addEventListener('pointerdown', function (ev) {
    canvas.setPointerCapture(ev.pointerId);
    pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    if (Object.keys(pointers).length >= 2) {
      // a second finger cancels the drag and starts a pinch
      drag = null;
      clearTimeout(holdTimer);
      holdTimer = null;
      holdFired = false;
      pinch = { dist: fingerDistance() };
      return;
    }
    drag = {
      button: ev.button,
      x: ev.clientX,
      y: ev.clientY,
      lastX: ev.clientX,
      lastY: ev.clientY,
      moved: false,
      mode: ev.button === 2 ? 'pan' : 'rotate'
    };
    if (ev.pointerType === 'touch') {
      holdTimer = setTimeout(function () {
        holdTimer = null;
        if (!drag || drag.moved) return;
        var hit = scene3d.pickAt(drag.x, drag.y);
        if (!hit || !hit.node) return;
        holdFired = true;
        hit.node.light.toggleAllRed();
      }, 550);
    }
  });

  canvas.addEventListener('pointermove', function (ev) {
    if (pointers[ev.pointerId]) {
      pointers[ev.pointerId].x = ev.clientX;
      pointers[ev.pointerId].y = ev.clientY;
    }
    if (pinch) {
      var d = fingerDistance();
      // cam.zoom grows with distance, so spreading the fingers has to divide
      if (d > 0 && pinch.dist > 0) scene3d.zoomBy(pinch.dist / d);
      pinch.dist = d;
      return;
    }
    if (drag) {
      var dx = ev.clientX - drag.lastX;
      var dy = ev.clientY - drag.lastY;
      if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 4) drag.moved = true;
      if (!scene3d.followed()) {
        if (drag.mode === 'rotate') scene3d.orbit(dx, dy);
        else scene3d.pan(dx, dy);
      }
      drag.lastX = ev.clientX;
      drag.lastY = ev.clientY;
    }

    var hit = scene3d.pickAt(ev.clientX, ev.clientY);
    var node = hit.node;
    if (node !== hoverNode) hoverNode = node;
    canvas.classList.toggle('hot', !!node || !!hit.car);
    var canvasRect = canvas.getBoundingClientRect();
    var stageRect = stage.getBoundingClientRect();
    if (node) {
      var l = node.light;
      tooltip.hidden = false;
      tooltip.textContent = '路口 (' + (node.col + 1) + ',' + (node.row + 1) + ') · ' +
        l.label() + (l.manual && sim.autoMode ? ' · 手动接管' : '');
      var sp = scene3d.lampScreen(node);
      tooltip.style.left = (canvasRect.left - stageRect.left + sp.x) + 'px';
      tooltip.style.top = (canvasRect.top - stageRect.top + sp.y) + 'px';
    } else if (hit.car) {
      tooltip.hidden = false;
      tooltip.textContent = carLabel(hit.car.type) + ' · 点击跟随';
      var cs = scene3d.carScreen(hit.car);
      tooltip.style.left = (canvasRect.left - stageRect.left + cs.x) + 'px';
      tooltip.style.top = (canvasRect.top - stageRect.top + cs.y) + 'px';
    } else {
      tooltip.hidden = true;
    }
  });

  canvas.addEventListener('pointerup', function (ev) {
    delete pointers[ev.pointerId];
    if (Object.keys(pointers).length < 2) pinch = null;
    clearTimeout(holdTimer);
    holdTimer = null;
    var wasHold = holdFired;
    holdFired = false;
    if (!drag) return;
    var click = !drag.moved;
    var button = drag.button;
    drag = null;
    if (wasHold) return;
    if (!click) {
      // dragging while a car is followed hands the view back to the map
      if (scene3d.followed()) scene3d.unfollow();
      return;
    }
    var hit = scene3d.pickAt(ev.clientX, ev.clientY);
    if (hit.car) {
      if (hit.car === scene3d.followed()) scene3d.unfollow();
      else scene3d.follow(hit.car);
      return;
    }
    var node = hit.node;
    if (!node) return;
    if (button === 2) {
      node.light.toggleAllRed();
    } else {
      node.light.beginManual();
      node.light.cycle();
    }
  });

  canvas.addEventListener('pointerleave', function () {
    hoverNode = null;
    tooltip.hidden = true;
    canvas.classList.remove('hot');
  });

  canvas.addEventListener('pointercancel', function (ev) {
    delete pointers[ev.pointerId];
    if (Object.keys(pointers).length < 2) pinch = null;
    clearTimeout(holdTimer);
    holdTimer = null;
    holdFired = false;
    drag = null;
  });

  canvas.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    scene3d.zoom(ev.deltaY);
  }, { passive: false });

  // keep Safari from turning a pinch on the canvas into a page zoom
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (name) {
    canvas.addEventListener(name, function (ev) { ev.preventDefault(); });
  });

  canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

  /* ------------------------------------------------------------ UI */

  el.modeAuto.addEventListener('click', function () { setMode(true); });
  el.modeManual.addEventListener('click', function () { setMode(false); });

  el.green.addEventListener('input', applySettings);
  el.yellow.addEventListener('input', applySettings);
  el.spawn.addEventListener('input', applySettings);
  el.cars.addEventListener('input', applySettings);

  el.pause.addEventListener('click', function () {
    running = !running;
    el.pause.textContent = running ? '暂停' : '继续';
  });

  el.reset.addEventListener('click', function () { rebuild(true); });

  el.night.addEventListener('click', function () {
    var on = el.night.textContent.indexOf('开') < 0;
    scene3d.setNight(on);
    el.night.textContent = on ? '夜景：开' : '夜景：关';
  });

  el.rain.addEventListener('click', function () {
    var on = el.rain.textContent.indexOf('雨') < 0;
    scene3d.setRain(on);
    el.rain.textContent = on ? '天气：雨' : '天气：晴';
  });

  el.closed.addEventListener('change', function () { sim.setClosed(el.closed.checked); });

  /* ------------------------------------------------------------ 自定义车辆 */

  function mark(box, btn) {
    var all = box.querySelectorAll('button');
    for (var i = 0; i < all.length; i++) all[i].classList.toggle('active', all[i] === btn);
  }

  // the kinds of car on offer: the ones that drive around by themselves, and
  // the rest, which can only be put on the map by hand
  var groups = [
    { label: '常见车型（自动出现）', common: true },
    { label: '特殊车型（仅手动加入）', common: false }
  ];
  groups.forEach(function (g) {
    var og = document.createElement('optgroup');
    og.label = g.label;
    CAR_CATALOG.forEach(function (c) {
      if (!!c.common !== g.common) return;
      var o = document.createElement('option');
      o.value = c.key;
      o.textContent = c.label;
      og.appendChild(o);
    });
    el.typeBox.appendChild(og);
  });
  el.typeBox.value = chosenType;
  el.typeBox.addEventListener('change', function () {
    chosenType = el.typeBox.value;
  });

  CAR_COLORS.forEach(function (c) {
    var s = document.createElement('button');
    s.className = 'swatch' + (c === chosenColor ? ' active' : '');
    s.style.background = c;
    s.title = c;
    s.addEventListener('click', function () {
      chosenColor = c;
      mark(el.colorBox, s);
    });
    el.colorBox.appendChild(s);
  });

  el.addCar.addEventListener('click', function () {
    var car = sim.addCar(chosenType, chosenColor);
    el.addHint.textContent = car
      ? '已加入：' + carLabel(chosenType) + ' ' + chosenColor
      : '路上没有空位了，稍后再试';
  });

  /* ------------------------------------------------------------ loop */

  function resize() {
    scene3d.resize();
  }
  window.addEventListener('resize', resize);

  var last = performance.now();
  var statTimer = 0;

  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (running) sim.update(dt);

    scene3d.render(sim, hoverNode, dt);

    statTimer += dt;
    if (statTimer > 0.25) {
      statTimer = 0;
      var s = sim.stats();
      el.stCars.textContent = s.cars;
      el.stSpeed.textContent = (s.speed * 0.9).toFixed(0) + ' km/h';
      el.stWait.textContent = s.wait.toFixed(1) + ' s';
      el.stFlow.textContent = s.flow + ' /min';
    }
    requestAnimationFrame(frame);
  }

  applySettings();
  rebuild(true);
  setMode(true);
  resize();
  requestAnimationFrame(frame);
})();
