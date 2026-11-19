'use strict';

/* ---------------------------------------------------------------- vehicles
   Every kind of vehicle in the city lives here.  `common` marks the ones that
   drive around on their own; the others can only be put on the map by hand,
   from the panel.

   A vehicle is a handful of lists of panels:
     body  [len, h, w, x, y, z, topX, topZ, rotZ]  takes the colour of the car
     glass [len, h, w, x, y, z, topX, topZ, rotZ]  windows
     trim  [hex, len, h, w, x, y, z, topX, topZ, rotZ]  keeps its own colour
     lamps [hex, len, h, w, x, y, z]                 head and tail lights
     cyl   [hex, r, h, x, y, z, rotZ, rotX]          tanks, drums, exhausts
   The car drives towards +X, its width runs along Z and Y is up.  topX and
   topZ pull the top face of a panel inwards, which is what gives the cars
   their tapered shapes; rotZ tilts a panel backwards. */

var CAR_COLORS = ['#e8eaed', '#4f9cf9', '#f6a434', '#5ad19b', '#f26d6d', '#b58cf0', '#e6d24a', '#4ec9c9'];

var TRIM = {
  black: 0x1a1e24,
  dark: 0x2b3138,
  grille: 0x11151a,
  chrome: 0xc3ccd6,
  steel: 0x8f979f,
  red: 0xd8321f,
  blue: 0x3f7fd8,
  yellow: 0xf0c419,
  white: 0xeef1f4,
  orange: 0xef7a2a,
  green: 0x2f8f5b
};

var CAR_SHAPES = {};
var CAR_CATALOG = [];

function shape(o) {
  return {
    label: o.label,
    common: !!o.common,
    len: o.len,
    wid: o.wid,
    wheelR: o.wheelR || 1.15,
    wheels: o.wheels || [],
    body: o.body || [],
    glass: o.glass || [],
    trim: o.trim || [],
    lamps: o.lamps || [],
    cyl: o.cyl || []
  };
}

// a variant of another vehicle: the panels of the base plus a few extras
function variant(base, extra) {
  var out = shape(base);
  out.label = extra.label || base.label;
  if (extra.len) out.len = extra.len;
  if (extra.wid) out.wid = extra.wid;
  var keys = ['body', 'glass', 'trim', 'lamps', 'cyl'];
  for (var i = 0; i < keys.length; i++) {
    if (extra[keys[i]]) out[keys[i]] = out[keys[i]].concat(extra[keys[i]]);
  }
  return out;
}

// bumpers, sills, a grille and the four lamps every car carries
function kit(o) {
  var trim = [], lamps = [];
  if (!o.noBumper) {
    trim.push([TRIM.black, 1.0, 0.8, o.wid - 0.6, o.front - 0.25, o.bumperY, 1, 1]);
    trim.push([TRIM.black, 1.0, 0.8, o.wid - 0.6, o.rear + 0.25, o.bumperY, 1, 1]);
  }
  var sl = o.sillLen || (o.front - o.rear) * 0.4;
  var sx = o.sillX === undefined ? 0 : o.sillX;
  trim.push([TRIM.dark, sl, 0.3, 0.4, sx, o.sillY, o.wid / 2 - 0.4, 1, 1]);
  trim.push([TRIM.dark, sl, 0.3, 0.4, sx, o.sillY, -(o.wid / 2 - 0.4), 1, 1]);
  if (!o.noGrille) trim.push([TRIM.grille, 0.5, 0.6, o.wid * 0.5, o.front - 0.15, o.grilleY, 1, 1]);
  var lw = o.lampW || o.wid * 0.26;
  var lz = o.wid / 2 - lw / 2;
  lamps.push([0xfff0cc, 0.5, 0.55, lw, o.front - 0.15, o.lampY, lz]);
  lamps.push([0xfff0cc, 0.5, 0.55, lw, o.front - 0.15, o.lampY, -lz]);
  lamps.push([0xd8321f, 0.45, 0.5, lw * 1.05, o.rear + 0.15, o.lampY, lz]);
  lamps.push([0xd8321f, 0.45, 0.5, lw * 1.05, o.rear + 0.15, o.lampY, -lz]);
  return { trim: trim, lamps: lamps };
}

// ---------------------------------------------------------------- 轿车
CAR_SHAPES.sedan = (function () {
  var s = shape({
    label: '轿车', common: true, len: 18, wid: 9, wheelR: 1.15,
    wheels: [[5.7, 4.25], [5.7, -4.25], [-5.7, 4.25], [-5.7, -4.25]]
  });
  s.body = [
    [16.8, 1.5, 8.6, 0, 1.55, 0, 0.99, 0.95],      // main body
    [16.2, 0.9, 8.7, -0.1, 2.85, 0, 0.97, 0.96],    // shoulder line
    [8.8, 1.2, 7.5, -0.9, 3.8, 0, 0.9, 0.9],        // greenhouse
    [7.8, 0.4, 7.0, -1.1, 4.55, 0, 0.96, 0.96],     // roof
    [1.4, 0.45, 1.8, 7.2, 3.55, 3.6, 1, 1],         // mirror
    [1.4, 0.45, 1.8, 7.2, 3.55, -3.6, 1, 1]
  ];
  s.glass = [
    [1.0, 1.05, 7.0, 3.3, 3.8, 0, 1, 1, -0.45],     // windscreen
    [0.8, 0.9, 7.0, -5.05, 3.8, 0, 1, 1, 0.4],      // rear window
    [6.2, 0.85, 0.28, -1.1, 3.8, 3.68, 1, 1],       // side windows
    [6.2, 0.85, 0.28, -1.1, 3.8, -3.68, 1, 1]
  ];
  var k = kit({ front: 8.4, rear: -8.4, wid: 9, bumperY: 0.85, sillY: 1.0, grilleY: 2.15, lampY: 1.95 });
  s.trim = s.trim.concat(k.trim);
  s.lamps = s.lamps.concat(k.lamps);
  return s;
})();

// ---------------------------------------------------------------- 跑车
CAR_SHAPES.sport = (function () {
  var s = shape({
    label: '跑车', common: true, len: 17.6, wid: 8.8, wheelR: 1.2,
    wheels: [[5.8, 4.15], [5.8, -4.15], [-5.8, 4.15], [-5.8, -4.15]]
  });
  s.body = [
    [16.8, 1.05, 8.4, 0, 1.25, 0, 0.99, 0.94],     // low body
    [15.8, 0.55, 8.5, -0.3, 2.15, 0, 0.96, 0.95],   // shoulder
    [5.6, 0.95, 6.9, -1.4, 2.9, 0, 0.85, 0.88],     // cabin
    [4.6, 0.35, 6.5, -1.8, 3.5, 0, 0.95, 0.95],    // roof
    [2.4, 0.22, 7.2, -7.2, 2.85, 0, 1, 1],         // spoiler blade
    [0.45, 0.85, 0.4, -7.3, 2.4, 2.5, 1, 1],        // spoiler stands
    [0.45, 0.85, 0.4, -7.3, 2.4, -2.5, 1, 1],
    [1.2, 0.4, 1.5, 6.8, 2.6, 3.4, 1, 1],          // mirrors
    [1.2, 0.4, 1.5, 6.8, 2.6, -3.4, 1, 1]
  ];
  s.glass = [
    [0.9, 0.85, 6.4, 1.25, 2.9, 0, 1, 1, -0.5],
    [0.7, 0.7, 6.2, -4.0, 2.85, 0, 1, 1, 0.45],
    [4.0, 0.7, 0.25, -1.6, 2.9, 3.4, 1, 1],
    [4.0, 0.7, 0.25, -1.6, 2.9, -3.4, 1, 1]
  ];
  s.trim = [
    [TRIM.black, 0.9, 0.35, 8.2, 8.2, 0.75, 1, 1],      // front splitter
    [TRIM.black, 0.9, 0.4, 8.2, -8.2, 0.8, 1, 1],       // rear diffuser
    [TRIM.black, 5.4, 0.22, 0.3, 0, 0.85, 4.05, 1, 1],   // side skirts
    [TRIM.black, 5.4, 0.22, 0.3, 0, 0.85, -4.05, 1, 1],
    [TRIM.grille, 0.5, 0.35, 4.2, 8.25, 1.6, 1, 1]      // grille
  ];
  s.lamps = [
    [0xfff6dd, 0.55, 0.32, 2.1, 8.2, 1.85, 3.35],
    [0xfff6dd, 0.55, 0.32, 2.1, 8.2, 1.85, -3.35],
    [0xe03020, 0.5, 0.3, 2.2, -8.2, 1.9, 3.4],
    [0xe03020, 0.5, 0.3, 2.2, -8.2, 1.9, -3.4]
  ];
  return s;
})();

// ---------------------------------------------------------------- 越野车
CAR_SHAPES.suv = (function () {
  var s = shape({
    label: '越野车', common: true, len: 17.6, wid: 9.2, wheelR: 1.5,
    wheels: [[5.7, 4.5], [5.7, -4.5], [-5.7, 4.5], [-5.7, -4.5]]
  });
  s.body = [
    [17.0, 2.6, 9.0, 0, 2.5, 0, 0.99, 0.96],        // tall body
    [10.4, 1.5, 8.2, -0.6, 4.55, 0, 0.9, 0.92],     // greenhouse
    [9.4, 0.4, 7.8, -0.9, 5.5, 0, 0.96, 0.96],      // roof
    [8.6, 0.3, 0.35, -0.9, 5.75, 3.2, 1, 1],        // roof rails
    [8.6, 0.3, 0.35, -0.9, 5.75, -3.2, 1, 1],
    [1.4, 0.45, 1.9, 7.4, 4.3, 4.2, 1, 1],          // mirrors
    [1.4, 0.45, 1.9, 7.4, 4.3, -4.2, 1, 1]
  ];
  s.glass = [
    [1.1, 1.25, 7.6, 4.15, 4.55, 0, 1, 1, -0.4],
    [0.9, 1.0, 7.6, -5.35, 4.5, 0, 1, 1, 0.3],
    [7.6, 1.05, 0.3, -0.8, 4.55, 4.05, 1, 1],
    [7.6, 1.05, 0.3, -0.8, 4.55, -4.05, 1, 1]
  ];
  var k = kit({ front: 8.5, rear: -8.5, wid: 9.2, bumperY: 1.4, sillY: 1.5, grilleY: 3.1, lampY: 2.6, lampW: 2.2 });
  s.trim = s.trim.concat(k.trim);
  // bull bar
  s.trim.push([TRIM.dark, 0.5, 1.7, 6.6, 8.6, 2.7, 1, 1]);
  s.trim.push([TRIM.dark, 0.35, 0.35, 0.5, 8.7, 2.0, 2.6, 1, 1]);
  s.trim.push([TRIM.dark, 0.35, 0.35, 0.5, 8.7, 2.0, -2.6, 1, 1]);
  s.lamps = s.lamps.concat(k.lamps);
  // roof marker lights
  s.lamps.push([0xff9d2e, 0.35, 0.25, 0.6, 4.6, 5.85, 3.1]);
  s.lamps.push([0xff9d2e, 0.35, 0.25, 0.6, 4.6, 5.85, -3.1]);
  return s;
})();

// ---------------------------------------------------------------- 卡车
CAR_SHAPES.truck = (function () {
  var s = shape({
    label: '卡车', common: true, len: 18.5, wid: 9.2, wheelR: 1.5,
    wheels: [[6.2, 4.4], [6.2, -4.4], [-3.2, 4.4], [-3.2, -4.4], [-6.4, 4.4], [-6.4, -4.4]]
  });
  s.body = [
    [6.0, 3.4, 8.8, 5.3, 2.9, 0, 0.98, 0.97],      // cab
    [12.0, 3.6, 9.0, -3.6, 2.9, 0, 0.99, 0.98],    // box body
    [12.2, 0.35, 9.1, -3.6, 4.85, 0, 1, 1]         // roof cap
  ];
  s.glass = [
    [0.5, 1.6, 7.6, 8.3, 3.6, 0, 1, 1],            // windscreen
    [2.6, 1.2, 0.4, 5.5, 3.5, 4.25, 1, 1],         // side windows
    [2.6, 1.2, 0.4, 5.5, 3.5, -4.25, 1, 1]
  ];
  var k = kit({ front: 8.3, rear: -9.6, wid: 9.2, bumperY: 1.3, sillY: 1.4, grilleY: 2.4, lampY: 2.1, lampW: 2.1 });
  s.trim = s.trim.concat(k.trim);
  s.cyl = [
    [TRIM.steel, 0.35, 3.4, 2.6, 3.7, 3.6, 0]      // exhaust stack
  ];
  s.lamps = s.lamps.concat(k.lamps);
  // roof marker lamps on the box
  s.lamps.push([0xff9d2e, 0.35, 0.25, 0.6, 0.2, 5.15, 3.3]);
  s.lamps.push([0xff9d2e, 0.35, 0.25, 0.6, 0.2, 5.15, -3.3]);
  s.lamps.push([0xff9d2e, 0.35, 0.25, 0.6, -2.4, 5.15, 3.3]);
  s.lamps.push([0xff9d2e, 0.35, 0.25, 0.6, -2.4, 5.15, -3.3]);
  return s;
})();

// ---------------------------------------------------------------- 厢式货车
CAR_SHAPES.van = (function () {
  var s = shape({
    label: '厢式货车', common: true, len: 17, wid: 9.2, wheelR: 1.25,
    wheels: [[5.6, 4.3], [5.6, -4.3], [-5.6, 4.3], [-5.6, -4.3]]
  });
  s.body = [
    [10.8, 3.8, 9.0, -3.4, 2.9, 0, 0.99, 0.98],    // cargo box
    [11.0, 0.35, 9.1, -3.4, 4.95, 0, 1, 1],        // cargo roof
    [6.4, 2.8, 8.9, 5.0, 2.4, 0, 0.98, 0.96],      // cab
    [6.0, 0.35, 8.6, 4.6, 3.95, 0, 1, 1]           // cab roof
  ];
  s.glass = [
    [0.9, 1.6, 7.8, 7.75, 3.3, 0, 1, 1, -0.42],    // windscreen
    [2.6, 1.2, 0.3, 6.2, 3.3, 4.35, 1, 1],         // side windows
    [2.6, 1.2, 0.3, 6.2, 3.3, -4.35, 1, 1]
  ];
  var k = kit({ front: 8.2, rear: -8.8, wid: 9.2, bumperY: 1.0, sillY: 1.2, grilleY: 2.3, lampY: 2.1, lampW: 2.1 });
  s.trim = s.trim.concat(k.trim);
  s.lamps = s.lamps.concat(k.lamps);
  return s;
})();

// ---------------------------------------------------------------- 出租车
CAR_SHAPES.taxi = variant(CAR_SHAPES.sedan, {
  label: '出租车',
  trim: [
    [TRIM.yellow, 1.6, 0.55, 2.2, 0.4, 4.95, 0, 1, 1],     // roof sign
    [TRIM.dark, 1.9, 0.2, 2.4, 0.4, 4.7, 0, 1, 1],        // sign base
    [TRIM.dark, 5.6, 0.28, 0.28, -1.4, 2.05, 4.42, 1, 1],  // door stripe
    [TRIM.dark, 5.6, 0.28, 0.28, -1.4, 2.05, -4.42, 1, 1]
  ]
});

// ---------------------------------------------------------------- 警车
CAR_SHAPES.police = variant(CAR_SHAPES.sedan, {
  label: '警车',
  trim: [
    [TRIM.dark, 1.6, 0.35, 5.8, 0.2, 4.85, 0, 1, 1],       // light bar base
    [TRIM.dark, 0.6, 0.9, 6.6, 8.6, 1.8, 1, 1],            // push bar
    [TRIM.dark, 0.35, 0.35, 0.5, 8.75, 1.4, 2.3, 1, 1],
    [TRIM.dark, 0.35, 0.35, 0.5, 8.75, 1.4, -2.3, 1, 1],
    [TRIM.dark, 5.6, 0.28, 0.28, -1.4, 2.05, 4.42, 1, 1],  // door stripe
    [TRIM.dark, 5.6, 0.28, 0.28, -1.4, 2.05, -4.42, 1, 1]
  ],
  lamps: [
    [0xd8321f, 1.3, 0.3, 2.2, 0.0, 5.05, 1.7, 0],          // red bar
    [0x3f7fd8, 1.3, 0.3, 2.2, 0.0, 5.05, -1.7, 0]          // blue bar
  ]
});

// ---------------------------------------------------------------- 救护车
CAR_SHAPES.ambulance = variant(CAR_SHAPES.van, {
  label: '救护车',
  len: 18,
  body: [
    [9.0, 1.2, 8.6, -3.4, 5.7, 0, 0.98, 0.98]       // raised roof
  ],
  trim: [
    [TRIM.red, 0.45, 2.0, 0.28, -3.4, 3.5, 4.5, 1, 1],   // cross
    [TRIM.red, 1.8, 0.6, 0.28, -3.4, 3.5, 4.5, 1, 1],
    [TRIM.red, 0.45, 2.0, 0.28, -3.4, 3.5, -4.5, 1, 1],
    [TRIM.red, 1.8, 0.6, 0.28, -3.4, 3.5, -4.5, 1, 1],
    [TRIM.dark, 1.4, 0.3, 4.8, 1.0, 6.45, 0, 1, 1]       // light bar base
  ],
  lamps: [
    [0x3f7fd8, 1.1, 0.28, 2.0, 1.0, 6.65, 1.7, 0],
    [0x3f7fd8, 1.1, 0.28, 2.0, 1.0, 6.65, -1.7, 0]
  ]
});

// ---------------------------------------------------------------- 消防车
CAR_SHAPES.fire = (function () {
  var s = shape({
    label: '消防车', len: 20, wid: 9.4, wheelR: 1.5,
    wheels: [[6.8, 4.4], [6.8, -4.4], [-4.0, 4.4], [-4.0, -4.4], [-7.0, 4.4], [-7.0, -4.4]]
  });
  s.body = [
    [6.2, 3.2, 9.0, 6.5, 2.5, 0, 0.98, 0.96],      // cab
    [12.6, 3.6, 9.2, -3.1, 2.8, 0, 0.99, 0.98],    // body
    [12.8, 0.4, 9.3, -3.1, 4.8, 0, 1, 1]           // roof cap
  ];
  s.glass = [
    [0.6, 1.6, 8.0, 9.55, 3.4, 0, 1, 1, -0.12],
    [2.6, 1.3, 0.35, 6.7, 3.4, 4.35, 1, 1],
    [2.6, 1.3, 0.35, 6.7, 3.4, -4.35, 1, 1]
  ];
  var k = kit({ front: 9.6, rear: -9.4, wid: 9.4, bumperY: 1.1, sillY: 1.3, grilleY: 2.5, lampY: 2.2, lampW: 2.1 });
  s.trim = s.trim.concat(k.trim);
  // roller shutters along the body
  s.trim.push([TRIM.chrome, 2.4, 2.0, 0.25, -3.4, 2.4, 4.62, 1, 1]);
  s.trim.push([TRIM.chrome, 2.4, 2.0, 0.25, -3.4, 2.4, -4.62, 1, 1]);
  // ladder on the roof
  s.trim.push([TRIM.chrome, 11.0, 0.28, 0.28, -3.0, 5.5, 1.5, 1, 1]);
  s.trim.push([TRIM.chrome, 11.0, 0.28, 0.28, -3.0, 5.5, -1.5, 1, 1]);
  for (var i = 0; i < 6; i++) {
    s.trim.push([TRIM.chrome, 0.25, 0.25, 3.0, -8.0 + i * 2.0, 5.5, 0, 1, 1]);
  }
  s.trim.push([TRIM.dark, 1.6, 0.35, 5.0, 3.0, 5.25, 0, 1, 1]);   // light bar base
  s.cyl = [
    [TRIM.red, 1.1, 1.2, 1.0, 5.0, 3.7, Math.PI / 2]              // hose reel
  ];
  s.lamps = s.lamps.concat(k.lamps);
  s.lamps.push([0xd8321f, 1.2, 0.28, 2.0, 3.0, 5.5, 1.7, 0]);
  s.lamps.push([0x3f7fd8, 1.2, 0.28, 2.0, 3.0, 5.5, -1.7, 0]);
  return s;
})();

// ---------------------------------------------------------------- 公交车
CAR_SHAPES.bus = (function () {
  var s = shape({
    label: '公交车', len: 24, wid: 9.6, wheelR: 1.5,
    wheels: [[7.6, 4.5], [7.6, -4.5], [-7.2, 4.5], [-7.2, -4.5]]
  });
  s.body = [
    [23.2, 3.1, 9.4, 0, 2.45, 0, 0.99, 0.97],       // body
    [23.4, 0.4, 9.5, 0, 4.2, 0, 1, 1]               // roof
  ];
  s.glass = [
    [0.7, 1.7, 8.6, 11.35, 3.2, 0, 1, 1, -0.12],    // windscreen
    [0.6, 1.4, 8.6, -11.4, 3.15, 0, 1, 1],          // rear window
    [15.0, 1.35, 0.3, -0.6, 3.2, 4.6, 1, 1],        // side windows
    [15.0, 1.35, 0.3, -0.6, 3.2, -4.6, 1, 1]
  ];
  var k = kit({ front: 11.6, rear: -11.6, wid: 9.6, bumperY: 1.0, sillY: 1.1, grilleY: 2.3, lampY: 2.0, lampW: 2.4 });
  s.trim = s.trim.concat(k.trim);
  // doors
  s.trim.push([TRIM.dark, 0.35, 2.4, 0.28, 7.4, 2.3, 4.7, 1, 1]);
  s.trim.push([TRIM.dark, 0.35, 2.4, 0.28, 7.4, 2.3, -4.7, 1, 1]);
  s.trim.push([TRIM.dark, 0.35, 2.4, 0.28, -2.6, 2.3, 4.7, 1, 1]);
  s.trim.push([TRIM.dark, 0.35, 2.4, 0.28, -2.6, 2.3, -4.7, 1, 1]);
  s.lamps = s.lamps.concat(k.lamps);
  return s;
})();

// ---------------------------------------------------------------- 校车
CAR_SHAPES.school = (function () {
  var s = shape({
    label: '校车', len: 22, wid: 9.4, wheelR: 1.5,
    wheels: [[6.8, 4.45], [6.8, -4.45], [-6.6, 4.45], [-6.6, -4.45]]
  });
  s.body = [
    [21.2, 3.1, 9.2, 0, 2.45, 0, 0.99, 0.97],
    [21.4, 0.4, 9.3, 0, 4.2, 0, 1, 1]
  ];
  s.glass = [
    [0.7, 1.7, 8.4, 10.35, 3.2, 0, 1, 1, -0.12],
    [0.6, 1.4, 8.4, -10.4, 3.15, 0, 1, 1],
    [13.6, 1.35, 0.3, -0.4, 3.2, 4.5, 1, 1],
    [13.6, 1.35, 0.3, -0.4, 3.2, -4.5, 1, 1]
  ];
  var k = kit({ front: 10.6, rear: -10.6, wid: 9.4, bumperY: 1.0, sillY: 1.1, grilleY: 2.3, lampY: 2.0, lampW: 2.4 });
  s.trim = s.trim.concat(k.trim);
  s.trim.push([TRIM.red, 19.0, 0.45, 0.3, 0, 2.15, 4.6, 1, 1]);   // red stripe
  s.trim.push([TRIM.red, 19.0, 0.45, 0.3, 0, 2.15, -4.6, 1, 1]);
  s.trim.push([TRIM.steel, 0.22, 1.5, 0.22, 9.6, 2.1, 4.7, 1, 1]);  // stop paddle
  s.trim.push([TRIM.red, 0.9, 0.9, 0.25, 9.6, 2.9, 4.7, 1, 1]);
  s.lamps = s.lamps.concat(k.lamps);
  return s;
})();

// ---------------------------------------------------------------- 商务车
CAR_SHAPES.mpv = (function () {
  var s = shape({
    label: '商务车', len: 18, wid: 9.4, wheelR: 1.3,
    wheels: [[5.8, 4.4], [5.8, -4.4], [-5.8, 4.4], [-5.8, -4.4]]
  });
  s.body = [
    [17.2, 3.4, 9.2, 0, 2.5, 0, 0.98, 0.97],        // one box shape
    [17.4, 0.4, 9.3, 0, 4.4, 0, 1, 1],              // roof
    [1.4, 0.45, 1.9, 7.6, 4.3, 4.1, 1, 1],          // mirrors
    [1.4, 0.45, 1.9, 7.6, 4.3, -4.1, 1, 1]
  ];
  s.glass = [
    [1.0, 1.5, 8.2, 8.15, 3.5, 0, 1, 1, -0.4],      // windscreen
    [0.7, 1.2, 8.0, -8.5, 3.4, 0, 1, 1, 0.28],      // rear window
    [11.4, 1.35, 0.3, -0.4, 3.5, 4.45, 1, 1],       // side windows
    [11.4, 1.35, 0.3, -0.4, 3.5, -4.45, 1, 1]
  ];
  var k = kit({ front: 8.6, rear: -8.6, wid: 9.4, bumperY: 1.0, sillY: 1.2, grilleY: 2.4, lampY: 2.1, lampW: 2.2 });
  s.trim = s.trim.concat(k.trim);
  s.lamps = s.lamps.concat(k.lamps);
  return s;
})();

// ---------------------------------------------------------------- 皮卡
CAR_SHAPES.pickup = (function () {
  var s = shape({
    label: '皮卡', len: 18, wid: 9.2, wheelR: 1.4,
    wheels: [[5.4, 4.4], [5.4, -4.4], [-5.0, 4.4], [-5.0, -4.4]]
  });
  s.body = [
    [6.4, 2.2, 8.9, 4.6, 2.1, 0, 0.98, 0.96],      // cab
    [5.6, 0.4, 8.2, 4.2, 3.4, 0, 1, 1],             // cab roof
    [9.6, 0.9, 9.0, -4.4, 1.85, 0, 1, 0.98],        // bed floor
    [9.6, 0.9, 0.35, -4.4, 2.45, 4.35, 1, 1],       // bed sides
    [9.6, 0.9, 0.35, -4.4, 2.45, -4.35, 1, 1],
    [0.35, 1.1, 9.0, -9.3, 2.4, 0, 1, 1]           // tailgate
  ];
  s.glass = [
    [0.9, 1.4, 8.0, 7.35, 2.9, 0, 1, 1, -0.42],
    [0.5, 1.1, 7.4, 1.35, 2.9, 0, 1, 1, 0.25],
    [2.4, 1.1, 0.3, 5.6, 2.9, 4.3, 1, 1],
    [2.4, 1.1, 0.3, 5.6, 2.9, -4.3, 1, 1]
  ];
  var k = kit({ front: 7.8, rear: -9.3, wid: 9.2, bumperY: 1.0, sillY: 1.2, grilleY: 2.2, lampY: 1.9, lampW: 2.2 });
  s.trim = s.trim.concat(k.trim);
  s.lamps = s.lamps.concat(k.lamps);
  return s;
})();

// ---------------------------------------------------------------- 敞篷车
CAR_SHAPES.roadster = (function () {
  var s = shape({
    label: '敞篷车', len: 16.6, wid: 8.6, wheelR: 1.15,
    wheels: [[5.4, 4.15], [5.4, -4.15], [-5.2, 4.15], [-5.2, -4.15]]
  });
  s.body = [
    [16.0, 1.1, 8.2, 0, 1.2, 0, 0.99, 0.94],       // low body
    [14.8, 0.45, 8.3, -0.4, 2.05, 0, 0.97, 0.95],  // deck
    [1.6, 0.75, 6.2, -1.2, 2.3, 0, 0.9, 0.95],     // seats
    [1.6, 0.75, 6.2, 1.0, 2.3, 0, 0.9, 0.95],
    [0.7, 0.4, 2.0, -1.6, 2.85, 2.2, 1, 1],        // head rests
    [0.7, 0.4, 2.0, 0.6, 2.85, -2.2, 1, 1],
    [1.1, 0.35, 1.4, 5.2, 2.3, 3.4, 1, 1],         // mirrors
    [1.1, 0.35, 1.4, 5.2, 2.3, -3.4, 1, 1]
  ];
  s.glass = [
    [0.45, 0.85, 6.4, 3.5, 2.45, 0, 1, 1, -0.5]    // small windscreen
  ];
  var k = kit({ front: 8.0, rear: -8.0, wid: 8.6, bumperY: 0.75, sillY: 0.9, grilleY: 1.6, lampY: 1.5, lampW: 1.8 });
  s.trim = s.trim.concat(k.trim);
  s.lamps = s.lamps.concat(k.lamps);
  return s;
})();

// ---------------------------------------------------------------- 加长车
CAR_SHAPES.limo = (function () {
  var s = shape({
    label: '加长车', len: 23, wid: 9.2, wheelR: 1.2,
    wheels: [[7.4, 4.35], [7.4, -4.35], [-7.2, 4.35], [-7.2, -4.35]]
  });
  s.body = [
    [21.6, 1.5, 8.8, 0, 1.55, 0, 0.99, 0.95],
    [21.0, 0.9, 8.9, -0.1, 2.85, 0, 0.97, 0.96],
    [14.0, 1.2, 7.6, -1.8, 3.8, 0, 0.9, 0.9],       // long greenhouse
    [13.0, 0.4, 7.1, -2.0, 4.55, 0, 0.96, 0.96],
    [0.35, 1.3, 7.4, 3.2, 3.75, 0, 1, 1],           // partition
    [1.4, 0.45, 1.8, 9.2, 3.55, 3.7, 1, 1],         // mirrors
    [1.4, 0.45, 1.8, 9.2, 3.55, -3.7, 1, 1]
  ];
  s.glass = [
    [1.0, 1.05, 7.0, 5.05, 3.8, 0, 1, 1, -0.45],
    [0.8, 0.9, 7.0, -8.6, 3.8, 0, 1, 1, 0.4],
    [11.0, 0.85, 0.28, -2.0, 3.8, 3.75, 1, 1],
    [11.0, 0.85, 0.28, -2.0, 3.8, -3.75, 1, 1]
  ];
  var k = kit({ front: 10.8, rear: -10.8, wid: 9.2, bumperY: 0.85, sillY: 1.0, grilleY: 2.15, lampY: 1.95, lampW: 2.0 });
  s.trim = s.trim.concat(k.trim);
  s.lamps = s.lamps.concat(k.lamps);
  return s;
})();

// ---------------------------------------------------------------- 搅拌车
CAR_SHAPES.mixer = (function () {
  var s = shape({
    label: '搅拌车', len: 20, wid: 9.4, wheelR: 1.5,
    wheels: [[6.6, 4.4], [6.6, -4.4], [-4.0, 4.4], [-4.0, -4.4], [-7.0, 4.4], [-7.0, -4.4]]
  });
  s.body = [
    [6.0, 3.0, 8.9, 6.4, 2.4, 0, 0.98, 0.96],      // cab
    [6.2, 0.35, 8.6, 6.2, 4.05, 0, 1, 1],           // cab roof
    [16.0, 0.6, 8.0, -1.0, 1.6, 0, 1, 1]           // chassis
  ];
  s.glass = [
    [0.6, 1.5, 7.8, 9.35, 3.3, 0, 1, 1, -0.12],
    [2.4, 1.1, 0.3, 6.6, 3.2, 4.35, 1, 1],
    [2.4, 1.1, 0.3, 6.6, 3.2, -4.35, 1, 1]
  ];
  var k = kit({ front: 9.4, rear: -9.4, wid: 9.4, bumperY: 1.1, sillY: 1.3, grilleY: 2.4, lampY: 2.1, lampW: 2.1 });
  s.trim = s.trim.concat(k.trim);
  s.trim.push([TRIM.steel, 2.6, 1.4, 3.4, -3.2, 4.7, 0, 0.95, 0.9]);  // drum hood
  s.trim.push([TRIM.dark, 2.4, 1.2, 3.0, -7.8, 3.4, 0, 0.9, 0.9]);     // chute
  s.cyl = [
    [TRIM.chrome, 1.7, 9.0, -2.4, 4.3, 0, Math.PI / 2 - 0.3]         // drum
  ];
  s.lamps = s.lamps.concat(k.lamps);
  return s;
})();

// ---------------------------------------------------------------- 罐车
CAR_SHAPES.tanker = (function () {
  var s = shape({
    label: '罐车', len: 21, wid: 9.4, wheelR: 1.5,
    wheels: [[7.0, 4.4], [7.0, -4.4], [-4.0, 4.4], [-4.0, -4.4], [-7.0, 4.4], [-7.0, -4.4]]
  });
  s.body = [
    [6.0, 3.0, 8.9, 7.4, 2.4, 0, 0.98, 0.96],      // cab
    [6.2, 0.35, 8.6, 7.2, 4.05, 0, 1, 1],
    [17.0, 0.6, 8.0, -1.5, 1.6, 0, 1, 1]           // chassis
  ];
  s.glass = [
    [0.6, 1.5, 7.8, 10.35, 3.3, 0, 1, 1, -0.12],
    [2.4, 1.1, 0.3, 7.6, 3.2, 4.35, 1, 1],
    [2.4, 1.1, 0.3, 7.6, 3.2, -4.35, 1, 1]
  ];
  var k = kit({ front: 10.4, rear: -9.4, wid: 9.4, bumperY: 1.1, sillY: 1.3, grilleY: 2.4, lampY: 2.1, lampW: 2.1 });
  s.trim = s.trim.concat(k.trim);
  s.trim.push([TRIM.steel, 1.2, 0.5, 1.2, -2.6, 6.0, 0, 1, 1]);   // hatch on the tank
  s.cyl = [
    [TRIM.chrome, 1.85, 11.5, -2.6, 4.2, 0, Math.PI / 2],       // tank
    [TRIM.steel, 1.9, 0.3, 3.15, 4.2, 0, Math.PI / 2],         // end caps
    [TRIM.steel, 1.9, 0.3, -8.35, 4.2, 0, Math.PI / 2]
  ];
  s.lamps = s.lamps.concat(k.lamps);
  return s;
})();

// ---------------------------------------------------------------- 半挂车
CAR_SHAPES.trailer = (function () {
  var s = shape({
    label: '半挂车', len: 24, wid: 9.4, wheelR: 1.5,
    wheels: [[8.4, 4.4], [8.4, -4.4], [-2.4, 4.5], [-2.4, -4.5], [-6.4, 4.5], [-6.4, -4.5]]
  });
  s.body = [
    [6.0, 3.0, 8.9, 9.0, 2.4, 0, 0.98, 0.96],      // tractor cab
    [6.2, 0.35, 8.6, 8.8, 4.05, 0, 1, 1],
    [2.4, 0.4, 4.2, 4.6, 1.9, 0, 1, 1],            // fifth wheel
    [15.8, 3.8, 9.2, -2.3, 3.2, 0, 1, 0.99],       // trailer box
    [16.0, 0.35, 9.3, -2.3, 5.25, 0, 1, 1],        // trailer roof
    [15.8, 0.5, 8.0, -2.3, 1.4, 0, 1, 1]           // trailer chassis
  ];
  s.glass = [
    [0.6, 1.5, 7.8, 11.95, 3.3, 0, 1, 1, -0.12],
    [2.2, 1.0, 0.3, 9.4, 3.2, 4.35, 1, 1],
    [2.2, 1.0, 0.3, 9.4, 3.2, -4.35, 1, 1]
  ];
  var k = kit({ front: 12.0, rear: -10.2, wid: 9.4, bumperY: 1.1, sillY: 1.4, grilleY: 2.4, lampY: 2.1, lampW: 2.1 });
  s.trim = s.trim.concat(k.trim);
  s.trim.push([TRIM.dark, 3.2, 0.3, 1.1, -4.4, 2.2, 4.6, 1, 1]);   // mudguards
  s.trim.push([TRIM.dark, 3.2, 0.3, 1.1, -4.4, 2.2, -4.6, 1, 1]);
  s.lamps = s.lamps.concat(k.lamps);
  return s;
})();

// ---------------------------------------------------------------- 沙滩车
CAR_SHAPES.buggy = (function () {
  var s = shape({
    label: '沙滩车', len: 13, wid: 7.6, wheelR: 1.7,
    wheels: [[4.2, 3.5], [4.2, -3.5], [-4.0, 3.5], [-4.0, -3.5]]
  });
  s.body = [
    [12.0, 0.5, 5.0, 0, 1.3, 0, 1, 1],             // floor pan
    [3.2, 0.8, 5.2, 4.0, 2.1, 0, 0.9, 0.9],        // bonnet
    [1.6, 1.0, 4.4, 0.4, 2.1, 0, 0.9, 0.95],       // seats
    [1.6, 1.0, 4.4, -1.6, 2.1, 0, 0.9, 0.95],
    [0.28, 2.2, 0.28, 2.6, 2.9, 2.4, 1, 1],        // roll cage
    [0.28, 2.2, 0.28, 2.6, 2.9, -2.4, 1, 1],
    [0.28, 2.2, 0.28, -3.4, 2.9, 2.4, 1, 1],
    [0.28, 2.2, 0.28, -3.4, 2.9, -2.4, 1, 1],
    [0.28, 0.28, 5.0, 2.6, 3.95, 2.4, 1, 1],      // cage roof
    [0.28, 0.28, 5.0, 2.6, 3.95, -2.4, 1, 1],
    [0.28, 0.28, 5.0, -3.4, 3.95, 0, 1, 1]
  ];
  s.trim = [
    [TRIM.steel, 0.4, 0.4, 6.4, 6.2, 1.5, 1, 1],    // front bar
    [TRIM.dark, 11.0, 0.3, 0.3, 0, 1.5, 2.5, 1, 1],
    [TRIM.dark, 11.0, 0.3, 0.3, 0, 1.5, -2.5, 1, 1]
  ];
  s.lamps = [
    [0xfff0cc, 0.4, 0.55, 0.6, 5.5, 2.3, 1.9, 0],
    [0xfff0cc, 0.4, 0.55, 0.6, 5.5, 2.3, -1.9, 0],
    [0xd8321f, 0.35, 0.4, 0.5, -6.1, 2.0, 1.9, 0],
    [0xd8321f, 0.35, 0.4, 0.5, -6.1, 2.0, -1.9, 0]
  ];
  return s;
})();

// ---------------------------------------------------------------- 观光车
CAR_SHAPES.golf = (function () {
  var s = shape({
    label: '观光车', len: 10, wid: 6.4, wheelR: 0.95,
    wheels: [[3.2, 2.85], [3.2, -2.85], [-3.0, 2.85], [-3.0, -2.85]]
  });
  s.body = [
    [9.0, 1.0, 5.4, 0, 1.3, 0, 0.96, 0.94],         // body
    [3.0, 0.4, 5.0, 2.8, 2.0, 0, 0.95, 0.95],       // bonnet
    [1.6, 0.4, 4.8, -0.2, 1.9, 0, 1, 1],             // seat cushion
    [1.4, 1.3, 4.6, -1.6, 2.2, 0, 0.9, 0.95],        // seat back
    [5.4, 0.3, 5.6, -1.2, 3.7, 0, 1, 1],             // canopy
    [0.25, 1.6, 0.25, 1.2, 3.0, 2.6, 1, 1],         // canopy posts
    [0.25, 1.6, 0.25, 1.2, 3.0, -2.6, 1, 1],
    [0.25, 1.6, 0.25, -3.4, 3.0, 2.6, 1, 1],
    [0.25, 1.6, 0.25, -3.4, 3.0, -2.6, 1, 1]
  ];
  s.trim = [
    [TRIM.dark, 0.4, 0.35, 4.6, 4.5, 1.3, 1, 1],     // front bumper
    [TRIM.dark, 0.4, 0.35, 4.6, -4.5, 1.3, 1, 1]
  ];
  s.cyl = [
    [TRIM.dark, 0.5, 0.14, 0.9, 2.5, 1.5, 0, 1.2]   // steering wheel
  ];
  s.lamps = [
    [0xfff0cc, 0.35, 0.35, 0.5, 4.4, 1.9, 1.8, 0],
    [0xfff0cc, 0.35, 0.35, 0.5, 4.4, 1.9, -1.8, 0],
    [0xd8321f, 0.3, 0.3, 0.45, -4.5, 1.9, 1.8, 0],
    [0xd8321f, 0.3, 0.3, 0.45, -4.5, 1.9, -1.8, 0]
  ];
  return s;
})();

/* ---------------------------------------------------------------- catalogue
   The order the panel shows them in: the five cars that drive around by
   themselves come first, the rest can only be added by hand. */

(function () {
  var order = [
    ['sedan', '轿车', true],
    ['sport', '跑车', true],
    ['suv', '越野车', true],
    ['truck', '卡车', true],
    ['van', '厢式货车', true],
    ['taxi', '出租车', false],
    ['police', '警车', false],
    ['ambulance', '救护车', false],
    ['fire', '消防车', false],
    ['bus', '公交车', false],
    ['school', '校车', false],
    ['mpv', '商务车', false],
    ['pickup', '皮卡', false],
    ['roadster', '敞篷车', false],
    ['limo', '加长车', false],
    ['mixer', '搅拌车', false],
    ['tanker', '罐车', false],
    ['trailer', '半挂车', false],
    ['buggy', '沙滩车', false],
    ['golf', '观光车', false]
  ];
  for (var i = 0; i < order.length; i++) {
    var key = order[i][0];
    var s = CAR_SHAPES[key];
    if (!s) continue;
    CAR_CATALOG.push({
      key: key,
      label: order[i][1] || s.label,
      common: order[i][2],
      len: s.len,
      wid: s.wid
    });
  }
})();
