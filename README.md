# Heart Rate Monitor

An offline-first Android app that shows your **live heart rate against a
24-hour rolling baseline** — immediate workout stress contrasted with historic
strain.

No account, no backend, no network dependency for core functionality. Everything
is stored on the device.

## How it works

Two independent data pipelines feed one dashboard:

- **Active BLE pipeline** — connects directly to any peripheral advertising the
  Bluetooth SIG Heart Rate Service (`0x180D`) for sub-second live telemetry,
  bypassing the OS sync latency.
- **Passive Health Connect pipeline** — reads aggregated heart rate records from
  Android Health Connect to compute a 24-hour mean, without touching the
  peripheral's battery.

Health Connect is optional: where it is unavailable, the app degrades to a
live-only monitor rather than failing.

## Documentation

- [`implementation.md`](implementation.md) — the full plan and the decision
  record (D1–D4) behind the architecture.
- [`docs/testing.md`](docs/testing.md) — test layout, what's covered, and a
  known `ui` rendering limitation.
- [`docs/releasing.md`](docs/releasing.md) — release process and the one-time
  signing setup that is **not yet done**.

## Development

Both native dependencies mean this **cannot run in Expo Go** — a dev build is
required.

```sh
npm install
npm run android      # dev build on a connected device/emulator
npm test             # both Jest projects
npm run typecheck
```

## Stack

Expo SDK 55 · React Native 0.83 (new architecture) · TypeScript strict ·
expo-router · zustand · expo-sqlite · react-native-ble-plx ·
react-native-health-connect

Structure, infra, and release process mirror the sibling `its-a-rock` and
`water-tracker` repos.

## Status

First-pass implementation. The full application layer is built and covered by
tests; the release pipeline is wired but needs its keystore and secrets before a
release can be cut. See [`docs/releasing.md`](docs/releasing.md).
