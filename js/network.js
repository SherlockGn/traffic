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
  // a junction with protected turns runs its own set of phases
  this.arrows = false;
  // a right turn is not held by the red light unless the driver says so
  this.rightOnRed = true;
}

// the phases of a junction with protected turns, in the order they run
var ARROW_ORDER = ['VA', 'YA', 'LA', 'HB', 'YB', 'LB'];

TrafficLight.prototype.leftTime = function () {
  return Math.max(4, Math.round(this.greenTime * 0.5));
};

TrafficLight.prototype.cycleLen = function () {
  if (this.arrows) {
    return 2 * (this.greenTime + this.yellowTime + this.leftTime());
  }
  return 2 * (this.greenTime + this.yellowTime);
};

// 'go' | 'caution' | 'stop' for the V (north-south) or H (east-west) axis
TrafficLight.prototype.axisSignal = function (axis) {
  if (this.allRed) return 'stop';
  if (this.arrows) {
    var p = this.currentPhase();
    if (p.axis !== axis) return 'stop';
    if (p.kind === 'through') return 'go';
    if (p.kind === 'yellow') return 'caution';
    return 'stop';
  }
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

// The phase the junction is in right now: which axis is going, and whether
// it is the through movement or the left turn arrow.
TrafficLight.prototype.currentPhase = function () {
  if (this.arrows) {
    if (this.manual) {
      if (this.state === 'VA') return { axis: 'V', kind: 'through' };
      if (this.state === 'YA') return { axis: 'V', kind: 'yellow' };
      if (this.state === 'LA') return { axis: 'V', kind: 'left' };
      if (this.state === 'HB') return { axis: 'H', kind: 'through' };
      if (this.state === 'YB') return { axis: 'H', kind: 'yellow' };
      return { axis: 'H', kind: 'left' };
    }
    return this.arrowPhase();
  }
  if (this.manual) {
    if (this.state === 'VA') return { axis: 'V', kind: 'through' };
    if (this.state === 'YA') return { axis: 'V', kind: 'yellow' };
    if (this.state === 'HB') return { axis: 'H', kind: 'through' };
    return { axis: 'H', kind: 'yellow' };
  }
  var cycle = this.cycleLen();
  var uV = (this.clock + this.offV) % cycle;
  var uH = (this.clock + this.offH) % cycle;
  if (uV < this.greenTime) return { axis: 'V', kind: 'through' };
  if (uV < this.greenTime + this.yellowTime) return { axis: 'V', kind: 'yellow' };
  if (uH < this.greenTime) return { axis: 'H', kind: 'through' };
  if (uH < this.greenTime + this.yellowTime) return { axis: 'H', kind: 'yellow' };
  return { axis: 'H', kind: 'yellow' };
};

// the phase of a junction with protected turns, worked out from the clock
TrafficLight.prototype.arrowPhase = function () {
  var g = this.greenTime, y = this.yellowTime, l = this.leftTime();
  var list = [
    ['V', 'through', g], ['V', 'yellow', y], ['V', 'left', l],
    ['H', 'through', g], ['H', 'yellow', y], ['H', 'left', l]
  ];
  var u = this.clock % this.cycleLen();
  for (var i = 0; i < list.length; i++) {
    if (u < list[i][2]) return { axis: list[i][0], kind: list[i][1] };
    u -= list[i][2];
  }
  return { axis: 'V', kind: 'through' };
};

// The state of a turn arrow: 'go' when the turn may go, 'stop' when it may
// not.  A right turn is not held by the red light unless the driver turns
// that rule off.
TrafficLight.prototype.arrowSignal = function (axis, turn) {
  if (this.allRed) return 'stop';
  if (turn === 'right') {
    if (this.rightOnRed) return 'go';
    return this.axisSignal(axis) === 'go' ? 'go' : 'stop';
  }
  if (!this.arrows) return this.axisSignal(axis) === 'go' ? 'go' : 'stop';
  var p = this.currentPhase();
  return (p.axis === axis && p.kind === 'left') ? 'go' : 'stop';
};

// The state of a lane signal: 'go', 'caution' or 'stop'.
TrafficLight.prototype.laneSignal = function (axis, turn) {
  if (this.allRed) return 'stop';
  if (turn === 'straight') return this.axisSignal(axis);
  if (turn === 'right') return this.arrowSignal(axis, 'right');
  if (!this.arrows) return this.axisSignal(axis) === 'go' ? 'go' : 'stop';
  var p = this.currentPhase();
  return (p.axis === axis && p.kind === 'left') ? 'go' : 'stop';
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
      if (this.arrows) {
        var i = ARROW_ORDER.indexOf(this.state);
        this.state = ARROW_ORDER[(i + 1) % ARROW_ORDER.length];
      } else {
        this.state = this.state === 'YA' ? 'HB' : 'VA';
      }
      this.stateTimer = 0;
    }
  }
};

// take this junction off the automatic plan, keeping the phase it shows now
TrafficLight.prototype.beginManual = function () {
  if (this.manual) return;
  this.manual = true;
  this.stateTimer = 0;
  if (this.arrows) {
    var p = this.arrowPhase();
    if (p.kind === 'left') this.state = p.axis === 'V' ? 'LA' : 'LB';
    else if (p.kind === 'yellow') this.state = p.axis === 'V' ? 'YA' : 'YB';
    else this.state = p.axis === 'V' ? 'VA' : 'HB';
    return;
  }
  var v = this.axisSignal('V'), h = this.axisSignal('H');
  if (v === 'go') this.state = 'VA';
  else if (v === 'caution') this.state = 'YA';
  else if (h === 'go') this.state = 'HB';
  else if (h === 'caution') this.state = 'YB';
  else this.state = 'VA';
};

// mouse click: hand over the green to the other axis (yellow first)
TrafficLight.prototype.cycle = function () {
  if (this.allRed) {
    this.allRed = false;
    this.state = this.arrows ? 'VA' : 'VA';
    this.stateTimer = 0;
    return;
  }
  if (this.arrows) {
    var i = ARROW_ORDER.indexOf(this.state);
    this.state = ARROW_ORDER[(i + 1) % ARROW_ORDER.length];
    this.stateTimer = 0;
    return;
  }
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
  var p = this.currentPhase();
  if (p.kind === 'left') return p.axis === 'V' ? '纵向左转' : '横向左转';
  if (p.kind === 'yellow') return p.axis === 'V' ? '纵向黄灯' : '横向黄灯';
  return p.axis === 'V' ? '纵向绿灯' : '横向绿灯';
};

/* ---------------------------------------------------------------- Network */

// The junction in the middle of the map is a big one: every approach has
// three lanes, one for the left turn, one to go straight on and one for the
// right turn.  The lanes sit next to each other in the space that the
// ordinary roads use for one.
var ARTERYAL_OFF = [5, 15, 25];

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
        out: {}, in: {}, outLanes: {}, inLanes: {}, light: null,
        // the junction in the middle of the map
        center: c === (CFG.COLS - 1) / 2 && r === (CFG.ROWS - 1) / 2,
        // the wide junctions have to be big enough for their roads
        box: (c === (CFG.COLS - 1) / 2 || r === (CFG.ROWS - 1) / 2) ? 60 : CFG.BOX,
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
      var lanes = this.makeLanes(n, nb, d);
      n.outLanes[d] = lanes;
      nb.inLanes[backOf(d)] = lanes;
      n.out[d] = lanes[0].id;
      nb.in[backOf(d)] = lanes[0].id;
    }
    n.light = new TrafficLight(n);
    // the junction in the middle of the map has protected turns: it shows
    // arrows for the left and the right turn
    if (n.col === (CFG.COLS - 1) / 2 && n.row === (CFG.ROWS - 1) / 2) {
      n.light.arrows = true;
    }
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

Network.prototype.makeLanes = function (from, to, dir) {
  var v = DIRS[dir];
  var rx = -v.y, ry = v.x;
  // the roads at the junction in the middle have three lanes
  var arterial = from.center || to.center;
  var offs = arterial ? ARTERYAL_OFF : [CFG.LANE_OFF];
  var lanes = [];
  for (var i = 0; i < offs.length; i++) {
    var off = offs[i];
    var lane = {
      id: from.id + '>' + to.id + (offs.length > 1 ? '#' + i : ''),
      from: from.id, to: to.id, dir: dir,
      vx: v.x, vy: v.y,
      p0: { x: from.x + rx * off, y: from.y + ry * off },
      p1: { x: to.x + rx * off, y: to.y + ry * off },
      len: isVertical(dir) ? CFG.BLOCK_Y : CFG.BLOCK_X,
      // which lane of the group this is: 0 left, 1 straight on, 2 right
      group: i, groupSize: offs.length,
      groupLanes: lanes,
      arterial: arterial,
      cars: []
    };
    this.lanes[lane.id] = lane;
    lanes.push(lane);
  }
  return lanes;
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

// The lane of a group that a turn uses: the left turn has its own lane, the
// right turn has its own, and what is left in the middle goes straight on.
Network.prototype.laneForTurn = function (group, turn) {
  if (!group || !group.length) return null;
  if (group.length < 3) return group[0];
  var idx = turn === 'right' ? 2 : (turn === 'straight' ? 1 : 0);
  return group[idx];
};

// The route through a junction: the way the car goes and the lane it takes
// on the road beyond.  On the wide roads of the middle of the map that lane
// belongs to the turn the car makes at the junction after it, so the route
// for that junction has to be worked out first.  The wide roads follow one
// another, so this looks a little further ahead each time.
Network.prototype.routeThrough = function (node, incomingDir, dest, hasRoom, closed, depth) {
  var choice = this.nextDirection(node, incomingDir, dest, hasRoom, closed);
  if (!choice || !choice.group || choice.group.length < 2) return choice;
  if (depth > 3) return choice;
  var beyond = this.nodes[choice.lane.to];
  var next = this.routeThrough(beyond, choice.dir, dest, hasRoom, closed, depth + 1);
  if (next && !next.exit) {
    choice.lane = this.laneForTurn(choice.group, next.turn);
    // the route for the junction after this one comes with it, so that the
    // car does not have to work it out again when it gets there
    choice.ahead = {
      lane: next.lane, turn: next.turn, node: beyond.id, ahead: next.ahead || null
    };
  }
  return choice;
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
    var group = node.outLanes[cands[i].dir] || [];
    var lane = this.laneForTurn(group, cands[i].turn);
    if (lane) {
      options.push({
        lane: lane, group: group, dir: cands[i].dir, turn: cands[i].turn,
        w: cands[i].w, free: !hasRoom || hasRoom(lane)
      });
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
