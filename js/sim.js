'use strict';

var STOP_BACK = 32;     // how far before the node a car waits
var CHOOSE_AHEAD = 46;  // how far before the junction the route is picked
// the cars that drive around on their own; the rest of the catalogue can
// only be put on the map by hand
var CAR_TYPES = ['sedan', 'sedan', 'sedan', 'suv', 'truck', 'sport', 'van'];

// how big a kind of car is on the road
function carSpec(type) {
  for (var i = 0; i < CAR_CATALOG.length; i++) {
    if (CAR_CATALOG[i].key === type) return CAR_CATALOG[i];
  }
  return null;
}

function idmAccel(v, vmax, gap, leadV, s0) {
  var a = CFG.ACCEL, b = CFG.DECEL, T = CFG.TIME_H;
  if (s0 === undefined) s0 = CFG.GAP0;
  var dv = v - leadV;
  var sStar = s0 + Math.max(0, v * T + (v * dv) / (2 * Math.sqrt(a * b)));
  var freeTerm = 1 - Math.pow(v / vmax, CFG.DELTA);
  var gapTerm = gap <= 0.05 ? 60 : Math.pow(sStar / gap, 2);
  var acc = a * (freeTerm - gapTerm);
  // brake no harder than the obstacle actually demands: the raw IDM term
  // explodes as the gap closes and stops the car dead in a single frame
  var need = (v * v - leadV * leadV) / (2 * Math.max(gap, 0.05));
  if (need < 0) need = 0;
  return Math.max(acc, -need);
}

/* ------------------------------------------------------------------ Vehicle */

function Vehicle(lane, s) {
  this.lane = lane;
  this.s = s;
  this.v = CFG.VMAX * rand(0.55, 0.95);
  this.vmax = CFG.VMAX * rand(0.85, 1.08);
  this.len = CFG.CAR_LEN;
  this.w = CFG.CAR_W;
  this.color = pick(CAR_COLORS);
  this.type = pick(CAR_TYPES);
  this.setType(this.type);
  this.next = null;      // {lane, turn} or {exit:true, dir}
  this.ahead = null;     // the route for the junction after the next one
  this.committed = false; // past the stop line: the car goes through
  this.dest = -1;        // side of the map this car is heading for
  this.phase = 'lane';   // lane | curve | exit
  this.curve = null;
  this.curveS = 0;
  this.curveIn = 0;
  this.curveOut = 0;
  this.exitPath = null;
  this.exitFrom = null;
  this.exitNode = null;
  this.exitDir = 0;
  this.exitS = 0;
  this.fade = 1;
  this.wait = 0;
  this.stoppedFor = 0;
  this.passCount = 0;
  this.dead = false;
  this.fresh = false;   // just came through a junction, tail still in the box
}

// a bus needs more room than a car, so the kind of car sets its own size
Vehicle.prototype.setType = function (type) {
  var spec = carSpec(type);
  this.type = type;
  this.len = spec ? spec.len : CFG.CAR_LEN;
  this.w = spec ? spec.wid : CFG.CAR_W;
};

Vehicle.prototype.pos = function () {
  var lane = this.lane, p;
  if (this.phase === 'lane') {
    p = { x: lane.p0.x + lane.vx * this.s, y: lane.p0.y + lane.vy * this.s };
  } else if (this.phase === 'curve') {
    p = curvePointAt(this.curve, this.curveS);
  } else {
    var e = this.exitPath;
    p = { x: e.x0 + e.vx * this.exitS, y: e.y0 + e.vy * this.exitS };
  }
  return p;
};

// heading in radians, so the car can be rotated continuously through a turn
Vehicle.prototype.heading = function () {
  if (this.phase === 'curve') {
    var t = curveTangentAt(this.curve, curveTAt(this.curve, this.curveS));
    return Math.atan2(t.y, t.x);
  }
  if (this.phase === 'exit') return Math.atan2(this.exitPath.vy, this.exitPath.vx);
  return Math.atan2(this.lane.vy, this.lane.vx);
};

function bezierAt(c, t) {
  var u = 1 - t;
  return {
    x: u * u * u * c.x0 + 3 * u * u * t * c.cx1 + 3 * u * t * t * c.cx2 + t * t * t * c.x1,
    y: u * u * u * c.y0 + 3 * u * u * t * c.cy1 + 3 * u * t * t * c.cy2 + t * t * t * c.y1
  };
}

function curveTangentAt(c, t) {
  var u = 1 - t;
  return {
    x: 3 * u * u * (c.cx1 - c.x0) + 6 * u * t * (c.cx2 - c.cx1) + 3 * t * t * (c.x1 - c.cx2),
    y: 3 * u * u * (c.cy1 - c.y0) + 6 * u * t * (c.cy2 - c.cy1) + 3 * t * t * (c.y1 - c.cy2)
  };
}

// arc length -> bezier parameter, so the car keeps a steady speed round the turn
function curveTAt(c, s) {
  var cum = c.cum, lo = 0, hi = cum.length - 1;
  if (s <= 0) return 0;
  if (s >= c.len) return 1;
  while (hi - lo > 1) {
    var mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid; else hi = mid;
  }
  var seg = cum[hi] - cum[lo];
  var f = seg > 0 ? (s - cum[lo]) / seg : 0;
  return (lo + f) / (cum.length - 1);
}

function curvePointAt(c, s) {
  return bezierAt(c, curveTAt(c, s));
}

// Handle length that turns the two tangent lines into a circular arc of
// radius LANE_OFF: d = 4/3 * R * tan(theta/4).  Using the full lane offset
// instead makes the car swerve sideways through the corner.
function handleLen(turn) {
  return CFG.LANE_OFF * (turn === 'uturn' ? 1.3333 : 0.5523);
}

// A right turn cannot be a quarter circle around the junction: the two lanes
// sit on opposite sides of it, so the arc has to start before the junction
// and end after it.  Left turns and u-turns fit around the centre.
function turnOffset(turn) {
  return turn === 'right' ? 2 * CFG.LANE_OFF : 0;
}

// control points sit on the two lanes' tangent lines, so the car enters and
// leaves the junction without a kink
function buildCurve(from, c1, c2, to) {
  var samples = 24, i, total = 0, prev = from, pt;
  var c = {
    x0: from.x, y0: from.y, cx1: c1.x, cy1: c1.y,
    cx2: c2.x, cy2: c2.y, x1: to.x, y1: to.y, len: 0, cum: [0]
  };
  for (i = 1; i <= samples; i++) {
    pt = bezierAt(c, i / samples);
    total += dist(prev.x, prev.y, pt.x, pt.y);
    c.cum.push(total);
    prev = pt;
  }
  c.len = total;
  return c;
}

Vehicle.prototype.insert = function () {
  var cars = this.lane.cars, i;
  for (i = 0; i < cars.length; i++) {
    if (cars[i].s > this.s) break;
  }
  cars.splice(i, 0, this);
};

Vehicle.prototype.remove = function () {
  var cars = this.lane.cars, i = cars.indexOf(this);
  if (i >= 0) cars.splice(i, 1);
};

// Gap and leader speed to the car ahead (same lane, then the queue ahead)
Vehicle.prototype.leaderInfo = function (sim) {
  var cars = this.lane.cars;
  var idx = cars.indexOf(this);
  if (idx >= 0 && idx + 1 < cars.length) {
    var lead = cars[idx + 1];
    return { gap: lead.s - this.s - (this.len + lead.len) / 2, leadV: lead.v };
  }

  var net = sim.net;
  var node = net.nodes[this.lane.to];
  var stopS = this.lane.len - STOP_BACK - this.len / 2;
  var blocked = !sim.mayCross(this, node);
  if (blocked) {
    return { gap: Math.max(0.05, stopS - this.s), leadV: 0 };
  }

  // green: watch the queue on the road we are about to enter
  var nxt = this.next;
  if (nxt && nxt.lane) {
    var nc = nxt.lane.cars;
    if (nc.length) {
      var first = nc[0];
      var curveLen = this.curve ? this.curve.len : 0;
      var dist2 = (this.lane.len - this.s) + curveLen + first.s - (this.len + first.len) / 2;
      if (dist2 < 120) return { gap: Math.max(0.05, dist2), leadV: first.v };
    }
  }
  return { gap: 4000, leadV: this.v };
};

// The route is decided once, when the car picks up the road, and it never
// changes afterwards.
Vehicle.prototype.chooseNext = function (sim) {
  if (this.next) return;
  var net = sim.net;
  var node = net.nodes[this.lane.to];
  var self = this;
  // the lane decides the turn: the left lane turns left or turns around, the
  // middle one goes straight on and the right one turns right
  var turns = null;
  if (this.lane.groupLanes && this.lane.groupLanes.length > 1) {
    turns = this.lane.group === 0 ? ['left', 'uturn']
      : (this.lane.group === 2 ? ['right'] : ['straight']);
  }
  // a way out that is already blocked would leave the car stuck at the stop
  // line for good, so the route counts what is ahead of it
  var room = function (lane) { return sim.laneHasRoom(lane, self.len); };
  var choice = net.routeThrough(node, this.lane.dir, this.dest, room, sim.closed, 0, turns);
  if (!choice && turns) {
    // The lane has no way out of this junction: it is one of the junctions at
    // the edge of the map, where the road the lane leads to does not go on.
    // The car takes whatever way out there is rather than stopping for good.
    choice = net.routeThrough(node, this.lane.dir, this.dest, room, sim.closed, 0, null);
  }
  if (!choice) {
    if (sim.closed) {
      // the map is closed, so the only road left is the one it came from
      var group = node.outLanes[backOf(this.lane.dir)];
      var back = net.laneForTurn(group, 'uturn');
      if (back) choice = { lane: back, turn: 'uturn' };
    }
    if (!choice) { this.next = { exit: true, dir: this.lane.dir, turn: 'straight' }; return; }
  }

  // The route for the junction after this one comes with it: on the wide
  // roads the car has to know it before it can pick the lane it drives in.
  this.makeCurve(choice, node);
};

// A turn as a rounded corner: the car drives along its lane to the point
// where the two lanes cross, and bends round it into the next lane.  Written
// as a cubic so the rest of the code can measure it, but the control points
// are the exact quadratic form of that corner, which turns steadily and never
// swings back.
function cornerCurve(p0, vx, vy, p1, lvx, lvy, out) {
  var cross = vx * lvy - vy * lvx;
  var wx = p1.x - p0.x, wy = p1.y - p0.y;
  var gap = Math.hypot(wx, wy);
  if (Math.abs(cross) < 0.2) {
    // the lanes run opposite ways: the car loops round in a half circle
    var ku = Math.max(6, gap * 0.85);
    out.pullIn = 0;
    out.pullOut = 0;
    return buildCurve(p0,
      { x: p0.x + vx * ku, y: p0.y + vy * ku },
      { x: p1.x - lvx * ku, y: p1.y - lvy * ku },
      p1);
  }
  // where the two lane lines cross: that point is the corner of the turn
  var a = (wx * lvy - wy * lvx) / cross;
  var b = (wx * vy - wy * vx) / cross;
  if (a < 0 || b < 0) return null;
  // The turn needs room, so the car leaves its lane a little before the
  // junction and joins the new one a little after it.  A quarter circle has
  // handles of 0.55 of the radius, and they leave along the lanes.
  var pullIn = Math.min(26, a + 14);
  var pullOut = Math.min(26, b + 14);
  var q0 = { x: p0.x - vx * pullIn, y: p0.y - vy * pullIn };
  var q1 = { x: p1.x + lvx * pullOut, y: p1.y + lvy * pullOut };
  var k1 = pullIn * 0.5523, k2 = pullOut * 0.5523;
  out.pullIn = pullIn;
  out.pullOut = pullOut;
  return buildCurve(q0,
    { x: q0.x + vx * k1, y: q0.y + vy * k1 },
    { x: q1.x - lvx * k2, y: q1.y - lvy * k2 },
    q1);
}

// The curve the car steers through into the next lane: a turn gets a proper
// curve, a car that only moves over into the lane beside it gets a smooth
// shift, and a car that stays in its lane gets none at all.
Vehicle.prototype.makeCurve = function (choice, node) {
  var from = this.lane.p1;
  if (choice.exit) {
    this.next = { exit: true, dir: choice.dir, turn: choice.turn };
    this.exitNode = node;
    this.exitDir = choice.dir;
    var ed = DIRS[choice.dir];
    var base = { x: node.x - ed.y * CFG.LANE_OFF, y: node.y + ed.x * CFG.LANE_OFF };
    if (choice.turn === 'straight') {
      // the car drives straight off the map, it only has to move over into
      // the lane of the road it leaves by
      var shift = (base.x - from.x) * -this.lane.vy + (base.y - from.y) * this.lane.vx;
      if (Math.abs(shift) < 0.01) {
        this.curve = null;
        this.curveIn = 0;
        this.curveOut = 0;
      } else {
        this.curveIn = Math.min(14, Math.abs(shift));
        this.curveOut = 0;
        var d0 = Math.min(16, Math.abs(shift) * 1.1);
        var q0 = { x: from.x - this.lane.vx * this.curveIn, y: from.y - this.lane.vy * this.curveIn };
        this.curve = buildCurve(
          q0,
          { x: q0.x + this.lane.vx * d0, y: q0.y + this.lane.vy * d0 },
          { x: base.x - ed.x * d0, y: base.y - ed.y * d0 },
          base
        );
        this.exitFrom = base;
      }
    } else {
      this.curveIn = turnOffset(choice.turn);
      this.curveOut = this.curveIn;
      var e = handleLen(choice.turn);
      var to = { x: base.x + ed.x * this.curveOut, y: base.y + ed.y * this.curveOut };
      var p0 = {
        x: from.x - this.lane.vx * this.curveIn,
        y: from.y - this.lane.vy * this.curveIn
      };
      this.curve = buildCurve(
        p0,
        { x: p0.x + this.lane.vx * e, y: p0.y + this.lane.vy * e },
        { x: to.x - ed.x * e, y: to.y - ed.y * e },
        to
      );
      this.exitFrom = to;
    }
    return;
  }

  var to2 = choice.lane.p0;
  // how far to the side the car has to move
  var lateral = (to2.x - from.x) * -this.lane.vy + (to2.y - from.y) * this.lane.vx;
  if (choice.turn === 'straight' && Math.abs(lateral) < 0.01) {
    // the two lanes meet at the same point, there is nothing to steer through
    this.curve = null;
    this.curveIn = 0;
    this.curveOut = 0;
  } else {
    // How far the car swings out before the junction and into the new road
    // depends on how far it has to travel: a lane change in a wide road can
    // be a long way to the side, and a curve with short handles would fold
    // into a corner.
    var lvx = choice.lane.vx, lvy = choice.lane.vy;
    if (choice.turn !== 'straight') {
      var out = { pullIn: 0, pullOut: 0 };
      var corner = cornerCurve(from, this.lane.vx, this.lane.vy, to2, lvx, lvy, out);
      this.curveIn = out.pullIn;
      this.curveOut = out.pullOut;
      this.curve = corner;
    } else {
      // a lane change: a gentle S between the two lanes, the handles a third
      // of the way along
      var chord = Math.hypot(to2.x - from.x, to2.y - from.y);
      var hd = Math.max(4, chord / 3);
      this.curveIn = 0;
      this.curveOut = 0;
      this.curve = buildCurve(
        from,
        { x: from.x + this.lane.vx * hd, y: from.y + this.lane.vy * hd },
        { x: to2.x - lvx * hd, y: to2.y - lvy * hd },
        to2
      );
    }
  }
  this.next = { lane: choice.lane, turn: choice.turn, ahead: choice.ahead || null };
};

Vehicle.prototype.update = function (dt, sim) {
  if (this.phase === 'exit') {
    if (sim.closed) { this.reenter(sim); return; }
    this.exitS += this.v * dt;
    this.fade = clamp(1 - (this.exitS - CFG.STUB * 0.45) / (CFG.STUB * 0.55), 0, 1);
    if (this.exitS > CFG.STUB) this.dead = true;
    return;
  }

  if (this.phase === 'curve') {
    if (this.v > CFG.CURVE_VMAX) {
      this.v = Math.max(CFG.CURVE_VMAX, this.v - CFG.DECEL * dt);
    }
    this.curveS += this.v * dt;
    if (this.curveS >= this.curve.len) {
      this.curveS = this.curve.len;
      if (this.next && this.next.exit) this.startExit(sim);
      else this.enterNextLane(sim);
    }
    return;
  }

  var lane = this.lane;
  // the route is picked shortly before the junction: any earlier and the road
  // it leads to may be full by the time the car gets there.  On the wide
  // roads of the middle of the map the lane goes with the route, so there the
  // route is picked as soon as the car is on the road.
  if (!this.next && (lane.arterial || lane.len - this.s <= CHOOSE_AHEAD)) {
    this.chooseNext(sim);
  }

  var info = this.leaderInfo(sim);
  // A car that has just come through the junction keeps creeping forward
  // until its tail is out of the box: waiting inside the junction blocks
  // everything that wants to cross it.
  var s0 = CFG.GAP0;
  if (this.fresh && this.s < CFG.BOX / 2 + this.len / 2) s0 = 2;
  var acc = idmAccel(this.v, this.vmax, info.gap, info.leadV, s0);
  this.v = Math.max(0, this.v + acc * dt);
  this.v = Math.min(this.v, this.vmax);

  // ease off for a turn instead of snapping down to cornering speed
  var turnS = lane.len - this.curveIn;
  if (this.curve) {
    var room = Math.max(0, turnS - this.s);
    var allow = Math.sqrt(CFG.CURVE_VMAX * CFG.CURVE_VMAX + 2 * CFG.DECEL * room);
    if (this.v > allow) this.v = allow;
  }

  if (this.v < 6) this.stoppedFor += dt; else this.stoppedFor = 0;
  this.wait += this.stoppedFor > 0.6 ? dt : 0;

  this.s += this.v * dt;
  if (this.fresh && this.s >= CFG.BOX / 2 + this.len / 2 + 1) this.fresh = false;

  // the stop line is where the front bumper halts, so the car never creeps
  // over it and then has to be yanked back
  var stopS = lane.len - STOP_BACK - this.len / 2;
  if (this.s >= stopS) {
    var node = sim.net.nodes[lane.to];
    if (!this.committed) {
      if (!sim.mayCross(this, node)) {
        this.s = stopS;
        this.v = 0;
        return;
      }
      // cleared the line: the car is in the junction and goes through whatever
      // the lights do next
      this.committed = true;
      node.slots[lane.dir] = { car: this, t: 0 };
    }
    this.s = Math.min(this.s, turnS);
    if (this.s >= turnS - 0.01) this.startCrossing(sim);
  }
};

Vehicle.prototype.startCrossing = function (sim) {
  var node = sim.net.nodes[this.lane.to];
  var dir = this.lane.dir;
  if (this.next.exit) {
    if (!this.curve) {
      // drives straight off the map
      var from = this.lane.p1;
      var d = DIRS[this.next.dir];
      this.phase = 'exit';
      this.exitPath = { x0: from.x, y0: from.y, vx: d.x, vy: d.y };
      this.exitS = 0;
      sim.releaseSlot(node, dir);
      this.passCount++;
      sim.flow++;
      return;
    }
    this.phase = 'curve';
    this.curveS = 0;
    return;
  }
  if (!this.curve) {
    // straight through: the next lane starts where this one ends
    this.enterNextLane(sim);
    return;
  }
  this.phase = 'curve';
  this.curveS = 0;
};

Vehicle.prototype.startExit = function (sim) {
  var node = sim.net.nodes[this.lane.to];
  var d = DIRS[this.next.dir];
  this.phase = 'exit';
  this.exitPath = {
    x0: this.exitFrom.x, y0: this.exitFrom.y,
    vx: d.x, vy: d.y
  };
  this.exitS = 0;
  this.curve = null;
  sim.releaseSlot(node, this.lane.dir);
  this.passCount++;
  sim.flow++;
};

// Put the car in the lane that belongs to the turn it is going to make at
// the end of the road it is on.  It is used when a car is put on the map by
// hand, and when it turns around at the edge.
Vehicle.prototype.fitLane = function (sim) {
  if (!this.next || this.next.exit) return;
  var group = sim.net.nodes[this.lane.from].outLanes[this.lane.dir];
  if (!group || group.length < 2) return;
  var turn = this.next.turn;
  var want = sim.net.laneForTurn(group, turn);
  if (!want || want === this.lane) return;
  this.remove();
  this.lane = want;
  this.insert();
  this.next = null;
  this.makeCurve({ lane: want, turn: turn }, sim.net.nodes[want.to]);
};

// Put a car that was driving off the map back onto the road behind it, so
// it turns around at the edge instead of leaving.
Vehicle.prototype.reenter = function (sim) {
  var node = this.exitNode;
  var lane = node ? sim.net.laneFrom(node, backOf(this.exitDir)) : null;
  if (!lane) { this.dead = true; return; }
  this.remove();
  this.lane = lane;
  this.s = -18;
  this.phase = 'lane';
  this.curve = null;
  this.next = null;
  this.ahead = null;
  this.committed = false;
  this.fresh = false;
  this.exitPath = null;
  this.exitS = 0;
  this.fade = 1;
  this.dest = -1;
  this.v = Math.min(this.v, CFG.CURVE_VMAX);
  this.insert();

  // The route is worked out right away, so that the car can be put in the
  // lane that belongs to the turn it is going to make further on.
  this.chooseNext(sim);
  this.fitLane(sim);
};

Vehicle.prototype.enterNextLane = function (sim) {
  var node = sim.net.nodes[this.lane.to];
  sim.releaseSlot(node, this.lane.dir);
  var lane = this.next.lane;
  // the route for the junction at the end of the new road, worked out when
  // the car picked the lane it is driving on
  var plan = this.next.ahead;
  this.remove();
  this.lane = lane;
  this.s = this.curveOut;
  this.phase = 'lane';
  this.curve = null;
  this.next = null;
  this.committed = false;
  this.fresh = true;
  this.passCount++;
  sim.flow++;

  if (plan && plan.lane && plan.node === lane.to) {
    this.makeCurve({ lane: plan.lane, turn: plan.turn }, sim.net.nodes[lane.to]);
    // and the route for the junction after that one comes along as well
    this.ahead = plan.ahead || null;
  }

  this.insert();
};

/* ------------------------------------------------------------------ Simulation */

function Simulation(net) {
  this.net = net;
  this.cars = [];
  this.time = 0;
  this.flow = 0;
  this.flowWindow = [];
  this.flowTimer = 0;
  this.spawnRate = 1;
  this.spawnAcc = 0;
  this.autoMode = true;
  this.paused = false;
  this.closed = false;
  // a red light does not hold a car that wants to turn right
  this.rightOnRed = true;
  this.nextId = 1;
  this.setRightOnRed(this.rightOnRed);
}

// Right turn on red: when it is on, the red light of the approach does not
// stop a car that is going to turn right.  When it is off, the right turn
// has to wait for the green.
Simulation.prototype.setRightOnRed = function (on) {
  this.rightOnRed = !!on;
  for (var i = 0; i < this.net.nodes.length; i++) {
    this.net.nodes[i].light.rightOnRed = this.rightOnRed;
  }
};

// Closed mode: no new car comes in and no car drives off the map.  Cars that
// were already on their way out are turned back onto the road.
Simulation.prototype.setClosed = function (on) {
  this.closed = !!on;
  if (!this.closed) return;
  for (var i = 0; i < this.cars.length; i++) {
    var car = this.cars[i];
    if (car.phase === 'exit' || (car.phase === 'curve' && car.next && car.next.exit)) {
      car.reenter(this);
    } else if (car.next && car.next.exit && !car.committed) {
      // it had not reached the junction yet, so it can still pick another road
      car.next = null;
      car.ahead = null;
      car.curve = null;
      car.curveIn = 0;
      car.curveOut = 0;
    }
  }
};

Simulation.prototype.update = function (dt) {
  this.time += dt;

  var nodes = this.net.nodes;
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    n.light.greenTime = this.greenTime || 12;
    n.light.yellowTime = this.yellowTime || 3;
    n.light.offH = (n.light.offV + n.light.greenTime + n.light.yellowTime) % n.light.cycleLen();
    n.light.advance(dt, this.autoMode && !n.light.manual);
    for (var d = 0; d < 4; d++) {
      if (n.slots[d]) {
        n.slots[d].t += dt;
        if (n.slots[d].t > 6) n.slots[d] = null;
      }
    }
  }

  if (!this.closed) {
    this.spawnAcc += this.spawnRate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.trySpawn();
    }
  }

  for (var c = 0; c < this.cars.length; c++) {
    this.cars[c].update(dt, this);
  }

  for (var k = this.cars.length - 1; k >= 0; k--) {
    if (this.cars[k].dead) {
      this.cars[k].remove();
      this.cars.splice(k, 1);
    }
  }

  this.flowTimer += dt;
  if (this.flowTimer >= 1) {
    this.flowTimer -= 1;
    this.flowWindow.push({ t: this.time, f: this.flow });
    while (this.flowWindow.length && this.time - this.flowWindow[0].t > 60) this.flowWindow.shift();
  }
};

// Can this car enter the intersection right now?
Simulation.prototype.mayCross = function (car, node) {
  var light = node.light;
  var dir = car.lane.dir;

  // already past the stop line: it is in the junction, it goes through
  if (car.committed) return true;

  var stopS = car.lane.len - STOP_BACK - car.len / 2;
  var distToStop = stopS - car.s;

  // which way is this car going to turn?  The route is picked before the
  // stop line, so by the time the car gets here it knows.
  var turn = 'straight';
  if (car.next && car.next.turn) turn = car.next.turn;
  var axis = isVertical(dir) ? 'V' : 'H';

  if (turn === 'left' && light.arrows) {
    // the left turn waits for its own arrow
    if (light.arrowSignal(axis, 'left') !== 'go') return false;
  } else if (turn === 'right') {
    // a right turn is not held by the red light, unless the driver has
    // turned that rule off
    if (light.arrowSignal(axis, 'right') !== 'go') return false;
  } else {
    var sig = light.signal(dir);
    if (sig === 'stop') return false;
    if (sig === 'caution') {
      var brakeDist = (car.v * car.v) / (2 * CFG.DECEL) + 8;
      if (distToStop > brakeDist) return false;
    }
  }

  // crossing slots: opposing streams never meet, perpendicular ones do
  var d = car.lane.dir;
  if (node.slots[d]) return false;
  if (node.slots[rightOf(d)] || node.slots[leftOf(d)]) return false;

  if (!car.next) {
    // too far out to have picked a route yet, nothing to hold the car for
    if (car.lane.len - car.s > CHOOSE_AHEAD) return true;
    car.chooseNext(this);
  }

  if (car.next && car.next.exit) return true;

  // the road ahead has to have room: driving in without any would trap the
  // car in the junction and block the box
  if (this.downstreamBlocked(car)) return false;

  // A left turn sweeps the corner of the junction and never meets the oncoming
  // stream, so it does not have to give way: making it wait would only hold
  // up the whole approach behind it.
  return true;
};

// Is there still room for one more car right after the junction?
// Only the gap at the entry counts: a queue further down the lane is fine,
// the car just joins it.  What must not happen is a car stopping inside the
// junction because the road it wants to enter has no space for it.
Simulation.prototype.laneHasRoom = function (lane, carLen) {
  if (!lane) return true;
  for (var q = 0; q < lane.cars.length; q++) {
    var ahead = lane.cars[q];
    if (ahead.s < 0) continue;      // still off the map, not in the way
    return ahead.s >= carLen + 12;  // the new car has to fit behind it
  }
  return true;
};

Simulation.prototype.downstreamBlocked = function (car) {
  if (!car.next || car.next.exit || !car.next.lane) return false;
  return !this.canClearBox(car.next.lane, car.len);
};

// Can a car that enters now get out of the junction again?  The queue on the
// road it wants to enter may stop at any moment, and a car that comes to a
// stand still with its tail inside the junction blocks the whole box.  So the
// road ahead has to be long enough for the car to wait outside the junction.
Simulation.prototype.canClearBox = function (lane, carLen) {
  if (!lane) return true;
  for (var q = 0; q < lane.cars.length; q++) {
    var ahead = lane.cars[q];
    if (ahead.s < 0) continue;          // still off the map, not in the way
    return ahead.s >= CFG.BOX / 2 + 1.5 * carLen + CFG.GAP0;
  }
  return true;
};

Simulation.prototype.releaseSlot = function (node, dir) {
  node.slots[dir] = null;
};

Simulation.prototype.trySpawn = function () {
  var net = this.net;
  var options = [];
  for (var i = 0; i < net.entryLanes.length; i++) {
    var entry = net.entryLanes[i];
    var lane = net.lanes[entry.id];
    var head = lane.cars.length ? lane.cars[0].s : 0;
    if (head > -14) options.push({ lane: lane, side: entry.side, head: head });
  }
  if (!options.length) return;
  var opt = pick(options);
  var s = Math.min(opt.head - 20, -7);
  if (s < -50) return;

  var car = new Vehicle(opt.lane, s);
  car.dest = this.pickDestination(opt.side);
  car.insert();
  this.cars.push(car);
};

// mostly drive straight across the city, sometimes sideways
Simulation.prototype.pickDestination = function (fromSide) {
  if (Math.random() < 0.72) return backOf(fromSide);
  var side = (Math.random() * 4) | 0;
  return side === fromSide ? backOf(fromSide) : side;
};

// scatter the opening fleet over the whole city, not just the map edges
Simulation.prototype.populate = function (count) {
  var net = this.net;
  var ids = Object.keys(net.lanes);
  for (var i = 0; i < count; i++) {
    var lane, s;
    if (Math.random() < 0.3) {
      var entry = pick(net.entryLanes);
      lane = net.lanes[entry.id];
      var head = lane.cars.length ? lane.cars[0].s : 0;
      if (head < -12) continue;
      s = Math.min(head - 20, -7);
    } else {
      lane = net.lanes[pick(ids)];
      // on the wide roads the car starts in the middle lane
      if (lane.groupLanes && lane.groupLanes.length > 1) lane = lane.groupLanes[1];
      s = 16 + Math.random() * (lane.len - 50);
      var clear = true;
      for (var k = 0; k < lane.cars.length; k++) {
        if (Math.abs(lane.cars[k].s - s) < 36) { clear = false; break; }
      }
      if (!clear) continue;
    }
    var car = new Vehicle(lane, s);
    car.dest = this.pickDestination(backOf(lane.dir));
    car.insert();
    this.cars.push(car);
  }
};

// A free stretch of lane with room in front of and behind it.
function freeSpot(lane, carLen) {
  var cars = lane.cars.slice().sort(function (a, b) { return a.s - b.s; });
  var s = 24;
  for (var i = 0; i < cars.length; i++) {
    if (cars[i].s - s > carLen + 14) return s;
    if (cars[i].s > s) s = cars[i].s + carLen + 14;
  }
  return s < lane.len - 24 ? s : -1;
}

// Put a car of the player's own choosing onto the map.  It is placed on the
// road closest to the middle of the city, so it shows up where the player is
// looking.
Simulation.prototype.addCar = function (type, color) {
  var net = this.net;
  var spec = carSpec(type);
  var carLen = spec ? spec.len : CFG.CAR_LEN;
  var cx = CFG.MARGIN_X + (CFG.COLS - 1) * CFG.BLOCK_X / 2;
  var cy = CFG.MARGIN_Y + (CFG.ROWS - 1) * CFG.BLOCK_Y / 2;
  var ids = Object.keys(net.lanes);
  var lanes = [];
  for (var i = 0; i < ids.length; i++) {
    var lane = net.lanes[ids[i]];
    var lx = (lane.p0.x + lane.p1.x) / 2, ly = (lane.p0.y + lane.p1.y) / 2;
    lanes.push({ lane: lane, d: dist(lx, ly, cx, cy) });
  }
  lanes.sort(function (a, b) { return a.d - b.d; });

  for (i = 0; i < lanes.length; i++) {
    var s = freeSpot(lanes[i].lane, carLen);
    if (s < 0) continue;
    var lane2 = lanes[i].lane;
    if (lane2.groupLanes && lane2.groupLanes.length > 1) lane2 = lane2.groupLanes[1];
    var car = new Vehicle(lane2, s);
    car.setType(type);
    car.color = color;
    car.dest = this.pickDestination(backOf(lanes[i].lane.dir));
    car.insert();
    this.cars.push(car);
    return car;
  }
  return null;
};

Simulation.prototype.stats = function () {
  var n = this.cars.length, sum = 0, stopped = 0, wait = 0;
  for (var i = 0; i < n; i++) {
    sum += this.cars[i].v;
    if (this.cars[i].v < 6) stopped++;
    wait += this.cars[i].wait;
  }
  var base = 0;
  for (var j = 0; j < this.flowWindow.length; j++) {
    if (this.time - this.flowWindow[j].t <= 60) { base = this.flowWindow[j].f; break; }
  }
  return {
    cars: n,
    speed: n ? sum / n : 0,
    stopped: stopped,
    wait: n ? wait / n : 0,
    flow: Math.max(0, this.flow - base)
  };
};
