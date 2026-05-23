# Forza Telemetry

A desktop companion app for **Forza Horizon 6** that ingests the game's UDP "Data Out" telemetry stream and renders it as live gauges, animated visualizations, and adjustable time-series graphs.

Built with Electron + React + TypeScript. Designed to live on a second monitor while you drive.

---

## Features (Phase 1)

- **Engine** — live RPM / torque / power readouts with a combined time-series chart. Series colors are user-customizable; the X-axis time window is selectable (5 s / 10 s / 20 s / 60 s).
- **Speed** — large speed readout with a unit toggle (m/s · km/h · mph) and its own time-series chart.
- **Suspension** — top-down 4-corner schematic with animated strut compression, plus an optional graph of normalized travel for all four wheels.
- **Wheel rotation** — four spinning wheels that match the game's actual angular velocity in real time, plus an optional graph (rad/s per wheel).
- **Tire temps** — four tire shapes that shift color with temperature (cold blue → optimal lime → hot red), plus an optional graph.
- **All 324 bytes parsed** — every field in the FH6 Data Out packet is captured by the parser, even ones not yet displayed, so new features won't require touching the network layer.

> A 3-D position/orientation map with path recording, playback, and save/load is planned for Phase 2 and is **not** included in this build. The data needed for it (position, yaw/pitch/roll, normalized driving line, etc.) is already being captured.

---

## Prerequisites

- **Node.js 20.x or newer** (LTS recommended)
- **npm 10+**
- **Forza Horizon 6** with Data Out enabled (see below)
- A Windows, macOS, or Linux PC. The app itself runs anywhere Electron does; the game obviously only runs on Windows / Xbox.

---

## Quick start

```bash
# from the project root
npm install
npm run dev
```

This launches the app in development mode with hot reload for the renderer process. The UDP listener starts immediately on port **20066** (configurable in-app via the Settings drawer).

### Building a distributable

```bash
npm run make:win     # Windows installer + portable .exe
npm run make:mac     # macOS .dmg
npm run make:linux   # Linux AppImage / deb
```

Built artifacts land in `dist/`.

---

## Configuring Forza Horizon 6

1. Launch Forza Horizon 6.
2. Open **Settings → HUD & Gameplay → Data Out**.
3. Toggle **Data Out** to **ON**.
4. Set the destination:
   - **IP Address** — `127.0.0.1` if the game and this app run on the same PC. Otherwise the LAN IP of the PC running this app.
   - **Port** — `20066` by default (or whatever you've set in the app's Settings drawer).
5. Save. The companion app should immediately start showing live data once you're in a session.

### Firewall

If the app is running on a different machine than the game, allow inbound UDP on the chosen port through the OS firewall.

### Note on port choice

Forza binds its **outgoing** socket to a port in the range **5200–5300** (you can see this in the game's network code). Don't use those for the listener — pick anything else. Common community choices are `20066`, `5300`, `9876`. Default in this app is `20066`.

---

## How it works

```
   ┌──────────────────┐    UDP    ┌────────────────────────────┐
   │                  │   324 B   │  Electron main process     │
   │  Forza Horizon 6 ├──────────▶│  • dgram socket            │
   │                  │  ~60 Hz   │  • packet parser           │
   └──────────────────┘           │  • electron-store settings │
                                  └──────────┬─────────────────┘
                                             │ IPC (contextBridge)
                                             ▼
                                  ┌────────────────────────────┐
                                  │  Renderer (React)          │
                                  │  • Zustand store + ring    │
                                  │    buffers (in-place mut.) │
                                  │  • rAF-cadence re-renders  │
                                  │  • uPlot streaming charts  │
                                  └────────────────────────────┘
```

The crucial performance choice is that **packets do not trigger React re-renders one-for-one**. At up to 240 Hz, that would melt the UI thread. Instead:

1. Each packet writes the latest sample into a shared ring buffer (mutated in place).
2. A monotonic `frame` counter increments — gauges that need a numeric readout subscribe to this and re-render.
3. Charts and animated visuals re-render on a single shared `requestAnimationFrame` tick (~60 Hz), reading whatever the buffers currently hold.

This decouples ingestion rate from render rate. The app could happily handle 1 kHz packets without breaking a sweat.

---

## Project layout

```
src/
├── main/                  # Electron main process (Node.js side)
│   ├── index.ts           # window creation, IPC wiring
│   ├── udpServer.ts       # dgram listener, status events
│   ├── packetParser.ts    # 324-byte FH6 packet → typed object
│   └── settings.ts        # electron-store wrapper
├── preload/               # contextBridge API exposed to the renderer
│   └── index.ts           # window.forza.{on*, get*, set*, restartListener}
├── renderer/              # React app
│   ├── App.tsx            # root, wires bridges & settings
│   ├── components/
│   │   ├── TopBar.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Settings.tsx
│   │   ├── Widget.tsx     # shared panel chrome
│   │   ├── ui.tsx         # Readout, SegmentedControl, etc.
│   │   ├── charts/
│   │   │   └── LiveLineChart.tsx   # uPlot wrapper
│   │   ├── widgets/       # one per dashboard panel
│   │   └── visuals/       # SVG visualizations
│   ├── store/             # Zustand stores
│   ├── lib/               # ring buffer, unit conversions, color maps
│   └── hooks/             # bridge + rAF tick
└── shared/                # types + IPC channel names (used by both sides)
    ├── telemetry.ts       # TelemetryData, AppSettings, defaults
    └── ipc.ts
```

---

## Packet format reference

Forza Horizon 6 sends a single fixed-format **324-byte** UDP packet per game frame, little-endian. No header, no Sled/Dash toggle (unlike Motorsport, which lets you choose).

- Bytes **0–231**: Sled section (engine, IMU, suspension travel, slip, world position, world velocity, …) — identical to Forza Motorsport 7 / FM (2023) / FH5.
- Bytes **232–243**: Horizon-specific fields — `CarGroup` (u32), `SmashableVelDiff` (f32), `SmashableMass` (f32). These don't exist in Motorsport.
- Bytes **244–322**: Dash section — `PositionX/Y/Z`, world speed, power, torque, tire temps, boost, fuel, lap timing, inputs, gear, steering, normalized driving line, normalized AI difficulty. FH6 omits `TireWear` and `TrackOrdinal`.
- Byte **323**: padding / unused.

Authoritative spec: <https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation>

---

## Settings

Open with the gear icon in the top-right, or **Ctrl/Cmd + ,**. Settings persist to `electron-store` (location depends on your OS — usually `%APPDATA%/forza-telemetry/config.json` on Windows).

- **Network** — UDP port. Changes restart the listener.
- **Speed** — display units (m/s · km/h · mph) and default time window.
- **Engine graph** — default time window + per-series color pickers.
- **Optional graphs** — toggle the graph-beneath-the-visual for suspension, wheel rotation, and tire temps, each with its own time window.

---

## Troubleshooting

**Nothing shows up after enabling Data Out in the game.**
Check the top bar. The status dot should be **lime** when packets are arriving. If it's yellow ("LISTENING"), the socket is bound but nothing's arriving — verify the IP and port in the game match the app, and check your firewall.

**Status is "OFFLINE" or shows a socket error.**
Another program is probably already bound to that port. Change the port in Settings (and in-game to match).

**Numbers freeze in menus.**
That's intentional. The buffer only records samples while `IsRaceOn == 1`, which prevents stale menu values from polluting your graphs. Live readouts still update; only the time-series buffer skips.

**Game is sending but I'm getting nothing on a separate PC.**
You probably forgot the firewall rule, or the IP you typed into the game isn't actually this machine's LAN IP. Run `ipconfig` (Win) / `ifconfig` (mac/linux) and confirm.

---

## License

MIT.
