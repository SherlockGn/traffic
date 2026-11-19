'use strict';

var CFG = {
  COLS: 3, ROWS: 3,
  BLOCK_X: 239, BLOCK_Y: 165, MARGIN_X: 34, MARGIN_Y: 32,
  LANE_OFF: 10, ROAD_W: 40, BOX: 34,
  CAR_LEN: 18, CAR_W: 9,
  VMAX: 90, ACCEL: 60, DECEL: 92, TIME_H: 1.15, GAP0: 6.5, DELTA: 4,
  CURVE_VMAX: 40, STUB: 50, WAVE_K: 1.7
};

var DIRS = [
  { x: 1, y: 0 },   // 0 East
  { x: 0, y: 1 },   // 1 South
  { x: -1, y: 0 },  // 2 West
  { x: 0, y: -1 }   // 3 North
];

function rightOf(dir) { return (dir + 1) % 4; }
function leftOf(dir) { return (dir + 3) % 4; }
function backOf(dir) { return (dir + 2) % 4; }
function dirFromVec(dx, dy) {
  if (dx > 0) return 0;
  if (dy > 0) return 1;
  if (dx < 0) return 2;
  return 3;
}
function isVertical(dir) { return dir === 1 || dir === 3; }

function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function rand(a, b) { return a + Math.random() * (b - a); }

function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

/* ---------------------------------------------------------------- Traffic light
   Auto mode derives the lamp colour from a shared clock plus a per-node offset,
   which lets neighbouring junctions be coordinated into a green wave.
   Manual mode freezes a junction on a hand-picked phase; yellows still time out. */

function TrafficLight(node) {
  this.node = node;
  this.greenTime = 12;
  this.yellowTime = 3;
  this.clock = Math.random() * 30;
  this.offV = 0;
  this.offH = 15;
  this.manual = false;
  this.allRed = false;
  this.state = 'VA';
  this.stateTimer = 0;
}

TrafficLight.prototype.cycleLen = function () {
  return 2 * (this.greenTime + this.yellowTime);
};

// 'go' | 'caution' | 'stop' for the V (north-south) or H (east-west) axis
TrafficLight.prototype.axisSignal = function (axis) {
  if (this.allRed) return 'stop';
  if (this.manual) {
    if (this.state === 'VA') return axis === 'V' ? 'go' : 'stop';
    if (this.state === 'YA') return axis === 'V' ? 'caution' : 'stop';
    if (this.state === 'HB') return axis === 'H' ? 'go' : 'stop';
    if (this.state === 'YB') return axis === 'H' ? 'caution' : 'stop';
    return 'stop';
  }
  var off = axis === 'V' ? this.offV : this.offH;
  var u = (this.clock + off) % this.cycleLen();
  if (u < this.greenTime) return 'go';
  if (u < this.greenTime + this.yellowTime) return 'caution';
  return 'stop';
};

TrafficLight.prototype.signal = function (dir) {
  return this.axisSignal(isVertical(dir) ? 'V' : 'H');
};

TrafficLight.prototype.colorFor = function (axis) {
  var s = this.axisSignal(axis);
  if (s === 'go') return 'green';
  if (s === 'caution') return 'yellow';
  return 'red';
};

TrafficLight.prototype.advance = function (dt, auto) {
  if (this.allRed) return;
  if (auto) {
    this.clock = (this.clock + dt) % this.cycleLen();
    return;
  }
  if (this.state === 'YA' || this.state === 'YB') {
    this.stateTimer += dt;
    if (this.stateTimer >= this.yellowTime) {
      this.state = this.state === 'YA' ? 'HB' : 'VA';
      this.stateTimer = 0;
    }
  }
};

// take this junction off the automatic plan, keeping the phase it shows now
TrafficLight.prototype.beginManual = function () {
  if (this.manual) return;
  this.manual = true;
  this.stateTimer = 0;
  var v = this.axisSignal('V'), h = this.axisSignal('H');
  if (v === 'go') this.state = 'VA';
  else if (v === 'caution') this.state = 'YA';
  else if (h === 'go') this.state = 'HB';
  else if (h === 'caution') this.state = 'YB';
  else this.state = 'VA';
};

// mouse click: hand over the green to the other axis (yellow first)
TrafficLight.prototype.cycle = function () {
  if (this.allRed) { this.allRed = false; this.state = 'VA'; this.stateTimer = 0; return; }
  if (this.state === 'VA') { this.state = 'YA'; this.stateTimer = 0; }
  else if (this.state === 'YA') { this.state = 'HB'; this.stateTimer = 0; }
  else if (this.state === 'HB') { this.state = 'YB'; this.stateTimer = 0; }
  else { this.state = 'VA'; this.stateTimer = 0; }
};

TrafficLight.prototype.toggleAllRed = function () {
  this.allRed = !this.allRed;
  this.stateTimer = 0;
};

TrafficLight.prototype.label = function () {
  if (this.allRed) return '全红';
  if (this.state === 'YA') return '纵向黄灯';
  if (this.state === 'YB') return '横向黄灯';
  if (this.manual) return this.state === 'VA' ? '纵向绿灯' : '横向绿灯';
  return this.axisSignal('V') === 'go' ? '纵向绿灯' : '横向绿灯';
};

/* ---------------------------------------------------------------- Network */

function Network() {
  this.nodes = [];
  this.lanes = {};
  this.entryLanes = [];
  this.exitDirs = {};
  this.build();
}

Network.prototype.build = function () {
  var c, r, i;
  for (r = 0; r < CFG.ROWS; r++) {
    for (c = 0; c < CFG.COLS; c++) {
      var node = {
        id: r * CFG.COLS + c, col: c, row: r,
        x: CFG.MARGIN_X + c * CFG.BLOCK_X,
        y: CFG.MARGIN_Y + r * CFG.BLOCK_Y,
        out: {}, in: {}, light: null,
        slots: { 0: null, 1: null, 2: null, 3: null }
      };
      this.nodes.push(node);
    }
  }

  for (i = 0; i < this.nodes.length; i++) {
    var n = this.nodes[i];
    for (var d = 0; d < 4; d++) {
      var v = DIRS[d];
      var nb = this.nodeAt(n.col + v.x, n.row + v.y);
      if (!nb) continue;
      var lane = this.makeLane(n, nb, d);
      n.out[d] = lane.id;
      nb.in[backOf(d)] = lane.id;
    }
    n.light = new TrafficLight(n);
    // green wave: the offset grows with the distance travelled along a corridor.
    // The two axes have blocks of different lengths, so each gets its own step.
    var waveX = (CFG.BLOCK_X / CFG.VMAX) * CFG.WAVE_K;
    var waveY = (CFG.BLOCK_Y / CFG.VMAX) * CFG.WAVE_K;
    n.light.offV = (((-(n.col * waveX + n.row * waveY)) % n.light.cycleLen()) + n.light.cycleLen()) % n.light.cycleLen();
    n.light.offH = (n.light.offV + n.light.greenTime + n.light.yellowTime) % n.light.cycleLen();
  }

  for (i = 0; i < this.nodes.length; i++) {
    var node2 = this.nodes[i];
    for (var d2 = 0; d2 < 4; d2++) {
      if (node2.out[d2]) {
        var lane = this.lanes[node2.out[d2]];
        var side = backOf(d2);
        if (this.leavesMap(node2, side)) {
          this.entryLanes.push({ id: lane.id, side: side });
        }
      }
    }
  }
};

Network.prototype.nodeAt = function (col, row) {
  if (col < 0 || row < 0 || col >= CFG.COLS || row >= CFG.ROWS) return null;
  return this.nodes[row * CFG.COLS + col];
};

Network.prototype.makeLane = function (from, to, dir) {
  var v = DIRS[dir];
  var rx = -v.y, ry = v.x;
  var off = CFG.LANE_OFF;
  var lane = {
    id: from.id + '>' + to.id,
    from: from.id, to: to.id, dir: dir,
    vx: v.x, vy: v.y,
    p0: { x: from.x + rx * off, y: from.y + ry * off },
    p1: { x: to.x + rx * off, y: to.y + ry * off },
    len: isVertical(dir) ? CFG.BLOCK_Y : CFG.BLOCK_X,
    cars: []
  };
  this.lanes[lane.id] = lane;
  return lane;
};

Network.prototype.lane = function (id) { return this.lanes[id]; };

// Direction a car leaves node `n` heading `dir`; null when it leaves the map.
Network.prototype.laneFrom = function (n, dir) {
  var id = n.out[dir];
  return id ? this.lanes[id] : null;
};

Network.prototype.leavesMap = function (node, dir) {
  var v = DIRS[dir];
  return !this.nodeAt(node.col + v.x, node.row + v.y);
};

// `closed` keeps every car on the map: driving off it is not an option, so
// a car that reaches the edge has to turn back into the city.
Network.prototype.nextDirection = function (node, incomingDir, dest, hasRoom, closed) {
  var cands = [
    { dir: incomingDir, turn: 'straight', w: 55 },
    { dir: rightOf(incomingDir), turn: 'right', w: 28 },
    { dir: leftOf(incomingDir), turn: 'left', w: 17 },
    { dir: backOf(incomingDir), turn: 'uturn', w: 4 }
  ];
  var options = [];
  for (var i = 0; i < cands.length; i++) {
    var lane = this.laneFrom(node, cands[i].dir);
    if (lane) {
      options.push({ lane: lane, turn: cands[i].turn, w: cands[i].w, free: !hasRoom || hasRoom(lane) });
    } else if (!closed && this.leavesMap(node, cands[i].dir)) {
      // leaving on the intended side is what the driver wants
      var w = (dest !== undefined && cands[i].dir === dest) ? 1200
            : (cands[i].turn === 'straight' ? 12 : 6);
      options.push({ exit: true, dir: cands[i].dir, turn: cands[i].turn, w: w, free: true });
    }
  }
  // The route is picked once, here, so it has to be picked sensibly: a way out
  // that is already blocked would leave the car stuck at the stop line for
  // good.  If every way out is blocked the car still takes one of them and
  // waits, rather than driving into a road that is full.
  var free = [];
  for (i = 0; i < options.length; i++) if (options[i].free) free.push(options[i]);
  if (free.length) options = free;
  if (!options.length) return null;

  var total = 0, j;
  for (j = 0; j < options.length; j++) total += options[j].w;
  var pickVal = Math.random() * total;
  for (j = 0; j < options.length; j++) {
    pickVal -= options[j].w;
    if (pickVal <= 0) return options[j];
  }
  return options[0];
};

// Straight-line distance from a point to the end of the "through" movement.
Network.prototype.isBoundary = function (node) {
  return node.col === 0 || node.row === 0 ||
         node.col === CFG.COLS - 1 || node.row === CFG.ROWS - 1;
};
