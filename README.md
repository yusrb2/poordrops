# PoorDrops

**AirDrop without the ecosystem tax.**

PoorDrops is a zero-server, peer-to-peer local file and live clipboard transfer app. Stop texting 40MB videos to your own WhatsApp chat, emailing yourself PDFs, or paying cloud storage subscriptions just to move a link from your laptop to your phone.

## What's New in v1.2.1

- **Free TURN Relay Servers (`openrelay.metered.ca`):** Added port 80/443 UDP & TCP TURN relay configuration alongside Google and Cloudflare STUN (`iceCandidatePoolSize: 6`) to punch through Windows Firewall and Wi-Fi Client Isolation.
- **Unified Web & Android Signaling (`poordrops-p2p-v1`):** Identical `trystero/mqtt` brokers (`emqx`, `hivemq`) and `1.1.1.1/cdn-cgi/trace` IPv4 matching so desktop and mobile always land in the same `LOBBY-XXXX` room.
- **Live ICE & Signaling Diagnostics + P2P Ping:** Real-time `Room · Signal · ICE` status bar, full-width **Retry Connection** recovery banner, per-device **Ping** latency tester, and a clean mobile-first square radar layout (`360px`–`430px`).

## What's New in v1.2.0

- **Sub-Second Local Wi-Fi Discovery (`@trystero-p2p/mqtt`):** Replaced slow signaling with redundant low-latency MQTT-over-WebSocket brokers (`emqx`, `mosquitto`, `hivemq`) + Google & Cloudflare STUN with `iceCandidatePoolSize: 4` for instant LAN candidate negotiation.
- **IPv4 Subnet Matching:** Forces IPv4-only lookup (`api4.ipify.org` -> `ipv4.icanhazip.com`) so Android phones (often on IPv6) and laptops land in the exact same Wi-Fi radar room.
- **1-Tap Rescan & Wake Auto-Reconnect:** Added an instant **Rescan** button, live signaling status badge, spring pop-in OS badges, 2s presence heartbeat with 7s stale pruning, and automatic beacon re-announcement on `visibilitychange` / `online` / Capacitor `appStateChange`.

## What's New in v1.1.0

- **Nearby Devices Radar (Zero-PIN Auto-Discovery):** Automatically discovers devices nearby on startup and shows them on a postal-stamp circular radar. Tap an avatar or drag-and-drop files straight onto it to ship immediately.
- **AirDrop-Style Accept / Decline Prompt & Auto-Accept:** Incoming transfers ring a gentle counter chime and show a thermal receipt confirmation modal with **Accept** / **Decline**, plus an **Auto-Accept Incoming Drops** switch.
- **Native Android Share Sheet (`ACTION_SEND` / `ACTION_SEND_MULTIPLE`) & PWA `share_target`:** Tap **Share** from your Android Gallery, File Manager, or Browser straight into PoorDrops and tap your laptop on the radar.
- **Custom Postal Stamp Icon:** Hand-crafted kraft & airmail vector icon bundled across PWA (`any` + `maskable`) and Android Adaptive Launcher mipmaps.

## Core Features

- **Zero-Server WebRTC P2P (`trystero`):** Direct browser-to-browser and device-to-device data channels with serverless signaling. No accounts, no uploads, no middleman.
- **Cross-Network 4-Digit PIN & Auto-QR:** Collapsible dispatch panel for connecting across different Wi-Fi or cellular networks via 4-box auto-submit PIN pad, `?pin=XXXX` QR code, and built-in camera QR scanner (`jsqr`).
- **Live Clipboard & Link Toss:** Real-time scratchpad with automatic URL extraction (**Open Link** / **Copy** 1-tap chips) and optional **Auto-Copy** toggle.
- **64KB Chunked Streaming + SHA-256 Verification:** Direct `RTCDataChannel` streaming with `bufferedAmountLowThreshold` backpressure, live `MB/s` + ETA telemetry, and cryptographic SHA-256 verification stamps on both ends.
- **Uncompressed Cargo & Client-Side ZIP (`fflate`):** Keep photos/videos raw, or bundle multiple files into a `.zip` right in the browser before shipping.
- **Cozy Postal Parcel & Thermal Receipt UI:** Light (*Unbleached Kraft*) and Dark (*Night Cargo Depot*) modes, local offline-bundled typography (`Tsuki`, `Nunito`, `Courier Prime`), optional mechanical Web Audio feedback, and instant **EN / ID** language switching.

## Tech Stack

- **UI:** Preact + TypeScript + Preact Signals + Tailwind CSS v4 + Radix UI Primitives + `lucide-preact`
- **P2P & Files:** `trystero` + `RTCDataChannel` + `fflate` + Web Crypto `SHA-256` + `qrcode` + `jsqr`
- **Packaging:** Vite + `vite-plugin-pwa` (Workbox) + Capacitor Android

## Local Development

```bash
npm install
npm run dev
```

Typecheck and production build:

```bash
npm run typecheck
npm run build
```

## Android APK (Capacitor)

Requires JDK 21 and Android SDK (Platform 36).

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

## License

Licensed under the **GNU General Public License v3.0 (GPL-3.0)** — see [LICENSE](LICENSE).
