# Traffic Simulator

A browser-based traffic simulation: a 3x3 grid of signalised junctions where vehicles
spawn, queue at red lights and cross the intersection. No build step, no dependencies to
install — plain HTML, CSS and JavaScript with [three.js](https://threejs.org) r149 vendored
in the repository.

**Live demo:** <https://sherlockgn.github.io/traffic/>

The in-app interface text is in Chinese.

## Features

- **Signalised 3x3 grid** — nine junctions, each with its own signal head and phase cycle
  (green / yellow / red), driven by an automatic cycle or taken over manually.
- **Fixed routes, no re-routing** — every vehicle picks a route when it enters the map and
  keeps it until it leaves. Congestion is resolved purely through the signal timing, never
  by re-routing traffic around a queue.
- **20 vehicle types** — sedans, sports cars, SUVs, trucks, vans plus taxi, police, ambulance,
  fire engine, bus, school bus, minivan, pickup, roadster, limousine, cement mixer, tanker,
  semi-trailer, beach buggy and sightseeing cart. All models are data-driven, so a new type
  is a data entry rather than new geometry code.
- **Common vs. special vehicles** — the five common types (sedan, sports car, SUV, truck, van)
  appear in random traffic; the other fifteen are only added by hand from the dropdown.
- **Follow camera** — click any vehicle to ride along behind it. The view returns to the map
  automatically when the vehicle leaves.
- **Closed map mode** — stop new vehicles from entering and turn the ones at the border around.
- **Live parameter panel** — green and yellow phase length, spawn rate, initial vehicle count,
  plus live statistics (vehicles on the map, average speed, stopped count, throughput).
- **Touch support** — one finger orbits, a two-finger pinch zooms, a long press on a signal
  switches it to all-red.

## Running it locally

Because the page loads its scripts and textures with relative paths, double-clicking
`index.html` works out of the box in a desktop browser.

To play on a phone (iOS Safari cannot open a local `file://` page), serve the folder over
HTTP and open it from the phone on the same Wi-Fi:

```bash
npx serve -l 8123
# then open http://<your-lan-ip>:8123 on the phone
```

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Orbit the camera | drag with the left mouse button | one-finger drag |
| Pan the camera | drag with the right mouse button | — |
| Zoom | mouse wheel | two-finger pinch |
| Switch a signal phase | left click a signal | tap a signal |
| Force all-red | right click a signal | long press a signal |
| Follow a vehicle | left click a vehicle | tap a vehicle |
| Day and night | the Night button in the panel | the Night button in the panel |

## Project layout

```
index.html            page shell and control panel markup
styles.css            dark theme, layout and the responsive phone layout
js/network.js         road graph: junctions, lanes, routes
js/cars.js            vehicle catalogue: 20 types with their body, glass, trim and lamp data
js/sim.js             simulation loop: spawning, car-following, signal phases, statistics
js/scenery.js         the blocks between the roads: parks, the beach and the fairground
js/city.js            the streets and the ring of houses around the map
js/render.js          three.js scene, instanced vehicle meshes, camera and picking
js/main.js            UI wiring, input handling (mouse, wheel, touch gestures)
js/vendor/three.min.js  three.js r149, vendored so the app works offline
```

## Browser support

Any browser with WebGL and Pointer Events: current Chrome, Edge, Firefox and Safari,
including iOS Safari 13 and later.

## License

[MIT](LICENSE) — see [LICENSE](LICENSE) for the full text.
