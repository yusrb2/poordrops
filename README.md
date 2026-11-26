# PoorDrops

**AirDrop without the ecosystem tax.**

PoorDrops is a zero-server, peer-to-peer local file and live clipboard transfer app. Stop texting 40MB videos to your own WhatsApp chat, emailing yourself PDFs, or paying cloud storage subscriptions just to move a link from your laptop to your phone.

## Features

- **Zero-Server WebRTC P2P (`trystero`):** Direct browser-to-browser and device-to-device data channels with serverless signaling. No accounts, no uploads, no middleman.
- **Lazy-Friendly Pairing:**
  - Instant 4-digit Waybill PIN + auto-generated `?pin=XXXX` QR code (scan with your phone's default camera to connect in ~1 second without typing).
  - 4-box auto-submit PIN pad (connects immediately on the 4th digit).
  - Built-in camera QR scanner (`jsqr`) and 1-tap Quick Reconnect.
- **Live Clipboard & Link Toss:** Real-time scratchpad with automatic URL extraction (**Open Link** / **Copy** 1-tap chips) and optional **Auto-Copy** toggle.
- **64KB Chunked Streaming + SHA-256 Verification:** Direct `RTCDataChannel` streaming with `bufferedAmountLowThreshold` backpressure, live `MB/s` + ETA telemetry, and cryptographic SHA-256 verification stamps on both ends.
- **Uncompressed Cargo & Client-Side ZIP (`fflate`):** Keep photos/videos raw, or bundle multiple files into a `.zip` right in the browser before shipping.
- **Cozy Postal Parcel & Thermal Receipt UI:** Light (*Unbleached Kraft*) and Dark (*Night Cargo Depot*) modes, local offline-bundled typography (`Tsuki`, `Nunito`, `Courier Prime`), optional mechanical Web Audio feedback, and instant **EN / ID** language switching.
- **Offline-First PWA & Android APK:** Pre-cached via Workbox (`vite-plugin-pwa`) and packaged for Android (`com.poordrops.app`) via Capacitor.

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
