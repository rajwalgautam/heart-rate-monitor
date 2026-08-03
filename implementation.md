# Heart Rate Monitor — Implementation Plan

> **Purpose of this document.** This is the single source of truth for building the **Heart Rate Monitor**, an offline-first Android app for tracking real-time heart rate against a historical baseline. It is written to be cut into GitHub issues, following the standard set by the `its-a-rock` project. The app's structure, infra, and release process will deliberately mirror the `its-a-rock` and `water-tracker` sibling repos.

---

## 1. Product Vision

The Heart Rate Monitor is a personal, **offline-first** Android utility for visualizing live heart rate data from a Bluetooth LE peripheral against a 24-hour rolling baseline average. It provides high-utility context by contrasting immediate workout stressors against historic physical strain.

The app features two distinct data pipelines:

1.  **The Passive Health Connect Pipeline:** Establishes a 24-hour moving baseline by periodically reading aggregated biometric data from Android's Health Connect, without impacting the peripheral's battery.
2.  **The Active BLE Broadcast Pipeline:** Achieves sub-second live telemetry during workouts by connecting directly to a heart rate monitor via Bluetooth LE, bypassing the standard OS sync/write latency.

The core UI is a simple dashboard displaying **live heart rate vs. baseline heart rate**. There is **no account, no backend, and no network dependency** for core functionality. All data and settings are stored locally on the device.

### Core Concepts

| Concept                 | Meaning                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Live Heart Rate**     | Real-time heart rate value streamed from a connected BLE device. Displayed as the "target" value.                                                            |
| **Baseline Heart Rate** | The mathematical mean of all heart rate samples from the last 24 hours, fetched from Android Health Connect.                                                 |
| **BLE Device**          | Any Bluetooth LE peripheral that broadcasts the standard Heart Rate Service (UUID `0x180D`).                                                                 |
| **Session**             | An active period of live monitoring, initiated by the user. The app maintains an explicit connection lock during a session.                                  |
| **Health Connect**      | The underlying Android service that aggregates health data from various apps (e.g., the official Fitbit app). This app is a read-only consumer of this data. |

---

## 2. Key Decisions (Resolved)

Four points were ambiguous or contradictory in the first draft of this document. They are resolved here, and the rest of the document reflects these resolutions. Each records its rationale so it is not re-litigated mid-implementation.

### D1 — BLE library: `react-native-ble-plx`

**Resolved:** use `react-native-ble-plx`. Not `react-native-ble-manager`.

**Rationale:** ble-plx ships its own Expo config plugin, which writes the Android 12+ Bluetooth permission entries (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, and the `neverForLocation` flag) into the manifest during prebuild. With ble-manager those manifest edits would have to be hand-rolled into a custom config plugin. ble-plx also exposes a promise-based, fully typed API, which is materially easier to mock in the `unit` Jest project than ble-manager's event-emitter surface.

**Note on `prompt.md`:** the architecture diagram there refers to a "BleManager Engine". That is read as generic phrasing for the central BLE coordinator, not a requirement to use the `react-native-ble-manager` package — and our own abstraction is still named `src/ble/BleManager.ts`, so the description holds. If ble-manager turns out to be a hard requirement, revisit this **before Epic B starts**. After that point every consumer is written against our façade, so the swap is contained to one file, but the permission plumbing becomes new work.

### D2 — Baseline polling: 30 seconds (foreground) + on-demand

**Resolved:** refresh the baseline on three triggers:

1. **Every 30 seconds** while the Live tab is focused and the app is in the foreground (`BASELINE_POLL_INTERVAL_MS`).
2. **On demand** — an explicit refresh affordance on the Baseline card, debounced to a minimum gap of 5 seconds (`MIN_MANUAL_REFRESH_INTERVAL_MS`).
3. **On app-foreground** — an immediate refetch via `AppState`, so a returning user never reads a stale number.

Both intervals are exported constants in `src/constants/health.ts`, so tuning either is a one-line change.

**Rationale:** the earlier draft of §8 said "every 15–20 minutes" while `prompt.md` said "60s background check". 30s is chosen deliberately: the read is a local Health Connect query — no network, no impact on the peripheral's battery, which is the entire point of the passive pipeline.

**Known limits (verified against Google's docs).** Google does **not** publish numeric Health Connect quotas. What is documented is the structure: reads are subject to *both* a periodic (rolling-window) limit and a separate daily limit, and background limits are stricter than foreground. Exceeding either surfaces as a rate-limit error.

**The binding constraint is not the quota — it is the upstream write cadence.** Per `prompt.md`, Fitbit syncs into Health Connect every 1–5 minutes. A 30-second poll therefore oversamples the source by 2–10×, and most polls will return byte-identical data. This is accepted (it costs almost nothing and keeps the number visibly live), but it drives three requirements:

- **Dedupe:** if the newest sample timestamp is unchanged since the last successful read, skip the state update entirely. Prevents pointless re-renders on the ~80% of polls that return nothing new.
- **Debounce:** manual refresh honours `MIN_MANUAL_REFRESH_INTERVAL_MS`, so a user repeatedly tapping refresh cannot burn quota.
- **Graceful degradation:** a rate-limit error is **non-fatal**. Retain the last known `baselineHeartRate` and `lastUpdated`, surface staleness in the UI rather than blanking the card, and back off exponentially before the next attempt.

Volume sanity check: foreground-only polling at 30s over one to two hours of realistic daily app use is ~120–240 reads/day — negligible. The only concerning case is leaving the app open in the foreground all day (~2,880 reads), which the backoff above absorbs.

**Fallback if rate limiting ever materializes:** Google's documented remedy is changelog tokens (`getChangesToken` / `getChanges`) instead of raw reads, maintaining a local mirror and asking only for deltas. Not built now — it complicates the 24-hour rolling window, which raw reads express naturally as a query — but it is the known escape hatch. A cheaper intermediate option is Health Connect's `aggregate()` API with `HeartRateRecord.BPM_AVG`, which returns the 24h mean directly with no sample flattening; rejected for now because raw samples are what would make the deferred standard-deviation feature (§12) additive rather than a rewrite.

**Scope limit — this is not true background execution.** A React Native `setInterval` stops when the app is backgrounded or killed. Polling while the app is not running would require an Android foreground service or `WorkManager` integration, which is explicitly **out of scope** (§12). "Background" in `prompt.md` is read as "without user action, off the UI's critical path", not "while the app is not running".

### D3 — `session_readings` is required, not optional

**Resolved:** write every accepted BLE heart-rate notification to `session_readings` for the duration of an active session. `avg_hr` and `max_hr` are computed from an **in-memory accumulator** in `useHeartRateStore`, not by querying the table at session end.

**Rationale:** at roughly one notification per second, a one-hour session is ~3,600 rows of two integers — trivial for SQLite. Capturing them makes the "advanced session analysis or charting" listed as out of scope in §12 a purely additive change later, rather than a data-model migration. Computing the summary from the accumulator rather than a `SELECT AVG(...)` keeps the summary correct even if an individual insert fails, and keeps a query off the session-end path.

### D4 — Health Connect permissions are their own work item

**Resolved:** Health Connect permission and availability plumbing gets a dedicated issue (§11, item 8), separate from the data-reading client.

**Rationale:** the earlier draft treated Health Connect as a library call. It is not. It requires:

- a **permissions rationale activity** declared in the Android manifest with the `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` intent filter — Health Connect rejects the permission request without one;
- `<queries>` entries so the app can detect whether the Health Connect package is even present;
- an explicit `android.permission.health.READ_HEART_RATE` declaration;
- a **graceful degraded path** for devices where Health Connect is missing or unavailable. On those devices the app must still function as a live-BLE-only monitor, with the Baseline card showing an explanatory empty state rather than an error.

`react-native-health-connect` provides an Expo config plugin covering most of the manifest work, but the rationale screen and the degraded path are ours to build. None of this is covered by the four `its-a-rock` build-fix plugins referenced in §9.

---

## 3. Tech Stack & Conventions

These will match `its-a-rock` and `water-tracker` exactly unless noted.

| Area            | Choice                                                                         | Reference/Notes            |
| --------------- | ------------------------------------------------------------------------------ | -------------------------- |
| Framework       | Expo (SDK ~55), React Native 0.83.x, new architecture (`newArchEnabled: true`) | `app.json`, `package.json` |
| Language        | TypeScript ~5.9, `strict: true`                                                | `tsconfig.json`            |
| Navigation      | `expo-router` ~55, file-based, `experiments.typedRoutes: true`                 | `app/`                     |
| State           | `zustand` ^5                                                                   | `src/store/`               |
| Persistence     | `expo-sqlite` (sync API, WAL mode) for session history.                        | `src/db/database.ts`       |
| Local Prefs     | `@react-native-async-storage/async-storage` for settings.                      | `src/storage/`             |
| Bluetooth       | **`react-native-ble-plx`** (see D1)                                            | _new for this app_         |
| Health Data     | `react-native-health-connect` (see D4)                                         | _new for this app_         |
| Haptics         | `expo-haptics`                                                                 | used in components         |
| Icons           | `@expo/vector-icons` (Ionicons)                                                | tab bar                    |
| Testing         | Jest, two projects (`unit` ts-jest/node, `ui` jest-expo/jsdom)                 | `jest.config.js`           |
| Module alias    | `@/*` → `src/*` (babel-plugin-module-resolver + tsconfig paths)                | `babel.config.js`          |
| Target platform | **Android only** for releases.                                                 | release workflow           |

> **Build requirement:** both new native dependencies mean this app **cannot run in Expo Go**. Development requires a dev build via `npx expo run:android`. CI already prebuilds from scratch, so nothing changes for releases.

### Code Conventions (follow `its-a-rock`)

- Components are function components returning `React.JSX.Element`, styled with `StyleSheet.create`.
- All colors, spacing, etc., come from `src/constants/theme.ts`.
- Pure logic (BLE parsing, baseline calculation) lives in `src/utils/`, `src/ble/utils.ts`, and `src/healthconnect/utils.ts`, and is unit-tested.
- Screens/components remain thin, calling actions from Zustand stores.
- Stores manage interactions with the BLE and Health Connect services.
- Native libraries never leak upward: everything crossing out of `src/ble/` or `src/healthconnect/` is normalized to a type declared in `src/types/index.ts`.

---

## 4. Repository & Project Structure

Target layout (mirrors `its-a-rock`). Items marked _(new)_ are specific to this app.

```
heart-rate-monitor/
├── implementation.md             # this file
├── README.md
├── app.json
├── package.json
├── tsconfig.json
├── babel.config.js
├── jest.config.js
├── app/
│   ├── _layout.tsx               # root stack; theme provider; DB init; permission checks
│   ├── (tabs)/
│   │   ├── _layout.tsx           # 2-tab bar: Live, Settings
│   │   ├── index.tsx             # Live Dashboard screen
│   │   └── settings.tsx          # Settings screen
│   └── ...
├── __tests__/                    # mirrors src/; .test.ts -> unit, .test.tsx -> ui
├── src/
│   ├── __mocks__/                # (copy from its-a-rock, + ble-plx & health-connect)
│   ├── components/
│   │   ├── LiveHeartRateCard.tsx # Displays live BPM
│   │   ├── BaselineStatCard.tsx  # Displays 24h baseline BPM (+ unavailable state, D4)
│   │   ├── ConnectionManager.tsx # UI for scanning, connecting, disconnecting
│   │   ├── SessionTimer.tsx      # Tracks active session duration
│   │   └── UpdateBanner.tsx      # In-app update prompt
│   ├── constants/
│   │   ├── theme.ts              # light + dark palettes, spacing, etc.
│   │   └── health.ts             # (new) poll + debounce intervals, 24h window (D2)
│   ├── db/
│   │   ├── database.ts           # openDatabaseSync + initDatabase (migrations)
│   │   └── queries.ts            # CRUD for sessions + session_readings
│   ├── ble/                      # (new) BLE logic
│   │   ├── BleManager.ts         # Abstraction over react-native-ble-plx
│   │   └── utils.ts              # Packet parsing logic (8-bit/16-bit)
│   ├── healthconnect/            # (new) Health Connect logic
│   │   ├── client.ts             # Abstraction over the HC library
│   │   └── utils.ts              # Sample flattening + baseline calculation
│   ├── store/
│   │   ├── useHeartRateStore.ts  # Live data, connection state, active session
│   │   ├── useBaselineStore.ts   # Baseline data, foreground polling
│   │   └── useSettingsStore.ts   # Theme mode, target device ID
│   ├── theme/
│   │   └── ThemeProvider.tsx     # Context for light/dark mode
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       ├── versionCompare.ts     # (copy from its-a-rock)
│       └── updateChecker.ts      # (adapt from its-a-rock)
├── plugins/                      # (copy from its-a-rock)
│   ├── withAndroidCompileSdk.js
│   ├── withAndroidMaterialPin.js
│   ├── withAndroidSigning.js
│   ├── withGradleProperties.js
│   └── withHealthConnectRationale.js  # (new, if the HC plugin is insufficient — D4)
├── docs/
│   ├── releasing.md
│   └── testing.md
└── .github/
    └── workflows/
        └── android-apk-release.yml # (adapt from its-a-rock)
```

---

## 5. Data Model

### 5.1 Health Connect (Read-Only)

The app does not write to Health Connect. It reads `HeartRateRecord` data for the last 24 hours. The raw data is not persisted in this app's database; only the calculated mean is held in state.

**Critical shape detail.** `HeartRateRecord` is **nested**: each record contains a `samples` array of `{ time, beatsPerMinute }` entries. The baseline is the mean **over all flattened samples**, not the mean of per-record values. Averaging per record instead of per sample yields a subtly wrong number that looks plausible — this is the single easiest bug to introduce in the passive pipeline, and it is why §10 requires an explicit unit test for the flattening step.

### 5.2 SQLite Database (`src/db/database.ts`)

A local SQLite database stores a history of workout sessions. Per **D3**, `session_readings` is part of the initial schema, not deferred.

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time    INTEGER NOT NULL,
  end_time      INTEGER,
  avg_hr        INTEGER,
  max_hr        INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_readings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  timestamp     INTEGER NOT NULL,
  hr_value      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_readings_session ON session_readings (session_id);
```

`avg_hr` and `max_hr` are written once, at session end, from the store's in-memory accumulator (D3).

### 5.3 TypeScript Types (`src/types/index.ts`)

```ts
export interface BleDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

export type ConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected';

/** Health Connect availability, for the degraded path in D4. */
export type HealthConnectStatus =
  | 'available'
  | 'unavailable'      // not installed / not supported on this device
  | 'permission-denied';

export interface Session {
  readonly id: number;
  startTime: number;
  endTime: number | null;
  avgHr: number | null;
  maxHr: number | null;
  createdAt: number;
}

export interface SessionReading {
  readonly id: number;
  sessionId: number;
  timestamp: number;
  hrValue: number;
}
```

---

## 6. Theming & Dark Mode

This will be a direct implementation of the `its-a-rock` theming system:

- `src/constants/theme.ts` exports `LIGHT` and `DARK` palettes.
- `src/theme/ThemeProvider.tsx` provides a context with `useTheme` hook.
- The chosen mode (`light`/`dark`/`system`) is persisted via `useSettingsStore`.
- `app.json` sets `"userInterfaceStyle": "automatic"`.

These files are **ported verbatim** from `its-a-rock` with only the accent color swapped. They are not to be rewritten.

---

## 7. Navigation & Screens

A simple 2-tab layout.

### 7.1 Tab Layout (`app/(tabs)/_layout.tsx`)

| Route      | Title        | Icon (Ionicons) |
| ---------- | ------------ | --------------- |
| `index`    | **Live**     | `pulse`         |
| `settings` | **Settings** | `settings`      |

### 7.2 Live Dashboard (`app/(tabs)/index.tsx`)

This is the main screen of the app.

- **Connection Status:** Shows whether a device is connected, connecting, or disconnected. Provides controls to scan and connect.
- **Live Heart Rate Card:** Displays the current BPM from the BLE stream.
- **Baseline Stat Card:** Displays the 24-hour average BPM from Health Connect, with a **manual refresh affordance** and a relative "updated Xm ago" timestamp (D2). When the value is stale following a rate-limit backoff, the last known number stays visible with the staleness marked. When `HealthConnectStatus` is not `available`, renders an explanatory empty state — the rest of the screen stays fully functional (D4).
- **Session Control:** A "Start Session" / "End Session" button. When a session is active, a `SessionTimer` is visible.
- **Resource Lifecycle:** This screen owns the lifecycle of BLE scanners, connections, and the baseline poll timer, releasing them when the user navigates away or the app is backgrounded. See §8 for the mechanism.

### 7.3 Settings (`app/(tabs)/settings.tsx`)

- **Appearance:** Light / Dark / System theme toggle.
- **Bluetooth:** A list of saved/favorite devices, and an option to auto-connect to a specific device (`targetDeviceId`).
- **About:** Version info and the in-app update checker, ported from `its-a-rock`.

---

## 8. State Management

Three Zustand stores.

- **`useHeartRateStore`:** Manages the active BLE connection.
  - State: `connectionState: ConnectionState`, `connectedDevice: BleDevice | null`, `liveHeartRate: number | null`, `activeSession: Session | null`, plus a private accumulator (`sampleCount`, `sampleSum`, `maxHr`) backing D3.
  - Actions: `startScan`, `stopScan`, `connectToDevice`, `disconnect`, `startSession`, `endSession`. These wrap `ble/BleManager.ts`.
  - Every subscription/scan action returns or stores an **unsubscribe handle**. Teardown must be **idempotent** — it will be called redundantly (disconnect during an active scan, app backgrounded mid-session, device dropping out of range).
- **`useBaselineStore`:** Manages the passive Health Connect data.
  - State: `baselineHeartRate: number | null`, `lastUpdated: number | null`, `isLoading: boolean`, `status: HealthConnectStatus`, `isStale: boolean`, `error: string | null`.
  - Actions: `fetchBaseline`, `refreshNow`, `startPolling`, `stopPolling`.
  - Polling runs on a `BASELINE_POLL_INTERVAL_MS` (30s) timer while the Live tab is focused, with an immediate refetch on app-foreground via `AppState` (D2).
  - `refreshNow` backs the manual refresh affordance and is debounced by `MIN_MANUAL_REFRESH_INTERVAL_MS` (5s); calls inside the window are dropped, not queued.
  - `fetchBaseline` **dedupes**: if the newest sample timestamp matches the previous successful read, it returns without touching state.
  - Rate-limit errors set `isStale` and trigger exponential backoff. They never clear `baselineHeartRate` or `lastUpdated` (D2).
- **`useSettingsStore`:** Manages user preferences.
  - State: `themeMode`, `targetDeviceId: string | null`.
  - Actions: `setThemeMode`, `setTargetDevice`, `load`. Persisted to AsyncStorage.

### 8.1 Resource Lifecycle Contract

This is the concrete form of the "garbage collection protocol" in `prompt.md`:

1. `BleManager` never exposes a subscribe/scan call that does not return a disposer.
2. Stores hold disposers in module state, never in React state.
3. `stopScan` / `disconnect` / `stopPolling` are safe to call when nothing is running.
4. The Live screen calls teardown from a `useEffect` cleanup tied to route focus, and from an `AppState` listener on background.
5. An active session takes precedence: backgrounding during a session keeps the BLE connection (the connection lock described in `prompt.md`) but stops the baseline poll timer.

---

## 9. Infrastructure (mirror `its-a-rock`)

The CI, build, signing, and release process will be identical to `its-a-rock`.

- **Same-Repo Releases:** The GitHub Actions workflow publishes signed APKs as GitHub Releases to the `rajwalgautam/heart-rate-monitor` repository itself, using the built-in `GITHUB_TOKEN`.
- **CI/Release Workflow:** A single `.github/workflows/android-apk-release.yml`, adapted from `its-a-rock`. It runs tests + typecheck on push/PR, and handles versioning, building, and publishing on `workflow_dispatch`.
- **Build & Caching:** Same Expo prebuild and Gradle caching strategy. `/android` and `*.jks` stay gitignored; every release prebuilds from scratch.
- **Config Plugins:** The four Android build-fix plugins from `its-a-rock` are copied and used, plus whatever D4 requires.
- **Signing & Secrets:** A new release keystore is generated for this app, and the same set of secrets (`KEYSTORE_BASE64`, etc.) added to the repository.
- **Versioning & Changelogs:** Identical — CI versions `app.json` and appends a unix-time suffix; `changelogs/vX.Y.Z.md` files are maintained by hand against the base version.
- **In-App Updates:** The update checker is ported and pointed at this repository's releases API endpoint.

---

## 10. Testing Strategy (mirror `its-a-rock`)

A `jest.config.js` with two projects (`unit` and `ui`), copied from `its-a-rock`. Convention: `.test.ts` → `unit` (ts-jest/node, react-native fully mocked, fast), `.test.tsx` → `ui` (jest-expo/jsdom, real react-native via RNTL).

- **Mocks:** `src/__mocks__/` — copy the existing `its-a-rock` mocks (`expo-sqlite`, `expo-haptics`, `async-storage`, `expo-router`, `expo-constants`, `react-native`), then add `react-native-ble-plx` and `react-native-health-connect`.
- **Unit Tests (`.test.ts`):**
  - **BLE packet parsing** — the highest-value test file in the project. Cases: 8-bit packet; 16-bit little-endian packet; the 255 BPM boundary that distinguishes the two formats; truncated buffer; empty buffer.
  - **Baseline calculation** — cases: flattening nested `samples` arrays across multiple records (§5.1); empty input returns `null`, not `NaN` or `0`; the 24-hour window boundary is applied correctly.
  - **Store logic** — `useHeartRateStore` connection-state transitions against a mocked `BleManager`, including redundant teardown (§8.1) and the D3 accumulator producing correct `avg_hr` / `max_hr`.
  - **Baseline polling (D2)** — with fake timers: the 30s interval fires; `refreshNow` inside the 5s debounce window is dropped; an unchanged newest-sample timestamp does not write state; a rate-limit error sets `isStale`, applies backoff, and leaves `baselineHeartRate` / `lastUpdated` intact.
- **UI Tests (`.test.tsx`):**
  - Render components with mock data and verify output, including the Baseline card's Health Connect-unavailable state and its stale state.
  - Test user interactions via React Native Testing Library.

---

## 11. Implementation Sequence & Work Breakdown

Ordered in six phases. Each numbered item is a self-contained issue. **Pure logic is deliberately built before the native wrappers it feeds** — parsing and baseline math are fully testable without a device, and they define the interface each wrapper has to satisfy.

Each phase ends with a **gate** that must pass before the next phase starts.

### Phase 1 — Project Scaffold & Conventions (Epic A)

1.  **Scaffold the Expo app.** `create-expo-app`, then pin dependency versions to match `its-a-rock/package.json` exactly (Expo ~55, RN 0.83.6, React 19.2, zustand ^5). Copy `tsconfig.json`, `babel.config.js` (the `@/*` → `src/*` resolver), and the `typecheck` / `test` / `test:watch` scripts.
2.  **Theme system + dark mode.** Port `ThemeProvider`, palettes, and the `useTheme` hook from `its-a-rock`; swap the accent color only.
3.  **Jest two-project setup + mocks.** Copy `jest.config.js` and the whole `src/__mocks__/` directory from `its-a-rock`.
4.  **Verify native-module compatibility.** Confirm `react-native-ble-plx` and `react-native-health-connect` both support RN 0.83 / the new architecture at the versions being installed, and that both minSdk requirements are satisfiable. If either fails, decide here whether to pin older versions or disable new arch — **not** in Phase 3.

> **Gate 1:** `npm run typecheck && npm test` pass on the empty app, and a dev build installs on a device.

### Phase 2 — Pure Logic (Epic B, testable half)

5.  **BLE packet parsing** (`src/ble/utils.ts`). Parse the Heart Rate Measurement characteristic: bit 0 of byte 0 is the format flag — `0` → `uint8` at byte 1, `1` → `uint16` little-endian at bytes 1–2. Handle truncated and empty buffers. Full unit coverage per §10.
6.  **Baseline calculation** (`src/healthconnect/utils.ts`). Flatten nested `samples` arrays across records (§5.1), filter to the 24-hour window, return the mean or `null` for empty input. Full unit coverage per §10.

> **Gate 2:** both modules at 100% branch coverage in the `unit` project, with zero native dependencies imported.

### Phase 3 — Native Service Wrappers (Epic B, rest)

7.  **BLE Manager service** (`src/ble/BleManager.ts`). A thin façade over ble-plx: `scan(onDevice)`, `stopScan()`, `connect(id)`, `subscribeHeartRate(cb)`, `disconnect()`. Scan filtered on service UUID `0x180D`. Normalize results to `BleDevice`. Every subscribe/scan returns a disposer (§8.1). Delegates decoding to item 5.
8.  **Health Connect permissions & availability** (D4). Config-plugin work: rationale activity + intent filter, `<queries>` entries, `READ_HEART_RATE` declaration. Expose `isAvailable()` returning `HealthConnectStatus`, and the degraded path for devices without Health Connect.
9.  **Health Connect client** (`src/healthconnect/client.ts`). `requestPermissions()` and `readHeartRate(since)`. Read-only — never writes. Delegates the mean to item 6.
10. **Runtime BLE permissions.** Android 12+ needs `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT`; below that, `ACCESS_FINE_LOCATION`. Requested at connect time, not app launch.

> **Gate 3:** on a real device, a scan finds a `0x180D` peripheral and logs decoded BPM values; a Health Connect read returns a baseline. No UI required yet.

### Phase 4 — Data & State (Epic C)

11. **SQLite schema & queries.** `database.ts` (`openDatabaseSync`, WAL, idempotent `initDatabase`) and `queries.ts` for `sessions` + `session_readings`, ported from the `its-a-rock` pattern.
12. **Zustand stores.** `useHeartRateStore` (connection state machine, disposer handling, D3 accumulator), `useBaselineStore` (30s focused poll, debounced `refreshNow`, `AppState` refetch, dedupe + rate-limit backoff — D2), `useSettingsStore` (AsyncStorage-persisted).

> **Gate 4:** store logic tests pass, including redundant-teardown and accumulator cases (§10).

### Phase 5 — UI & Screens (Epic D)

13. **Tab layout.** The 2-tab bar (`Live`, `Settings`).
14. **Shared components.** `LiveHeartRateCard`, `BaselineStatCard` (including the unavailable state), `ConnectionManager`, `SessionTimer`.
15. **Live Dashboard screen.** Assembles the components, wires the lifecycle contract in §8.1 to route focus and `AppState`.
16. **Settings screen.** Theme toggle, saved-device / auto-connect controls, About + update checker section.

> **Gate 5:** a full session runs end to end on a device — connect, live BPM against baseline, start/end session, summary persisted — and the app survives backgrounding mid-session without leaking a scanner or timer.

### Phase 6 — Infrastructure (Epic E)

17. **Config plugins & signing.** Port the four plugins from `its-a-rock`. **Requires manual action outside this repo:** generate the release keystore and add `KEYSTORE_BASE64` and the related secrets to the GitHub repository. This cannot be automated from the codebase.
18. **CI / release workflow.** Adapt `android-apk-release.yml` for same-repo releases (it is already the same-repo variant in `its-a-rock`, so this is largely a name swap). `RELEASE_DEPLOY_KEY` is **not** required here: unlike `its-a-rock`, this repo is private on a free plan where branch protection is unavailable, so `GITHUB_TOKEN` can push the version bump directly. See `docs/releasing.md`.
19. **In-app updates.** Port `versionCompare.ts` and `updateChecker.ts`, pointed at this repo's releases API.
20. **Documentation.** `docs/releasing.md` and `docs/testing.md`, adapted from `its-a-rock`.

> **Gate 6:** a `workflow_dispatch` run produces a signed APK attached to a GitHub Release, and a previously installed build detects it via the in-app update checker.

---

## 12. Out of Scope

- iOS support.
- Writing any data to Health Connect.
- Cloud synchronization or user accounts.
- Advanced session analysis or charting beyond a simple session summary. (D3 captures the data that would make this additive later.)
- True background execution — foreground services, `WorkManager`, or polling while the app is not running (D2).
- Standard-deviation / anomaly tracking on heart rate spikes, floated at the end of `prompt.md`. Deferred; `session_readings` (D3) is the data that would enable it.

---

## 13. References

- **Sibling Repos:** `rajwalgautam/its-a-rock`, `rajwalgautam/water-tracker`
- **BLE Service:** Bluetooth SIG Heart Rate Service `0x180D`; Heart Rate Measurement characteristic `0x2A37`
- **Libraries:** `react-native-ble-plx`, `react-native-health-connect`, `expo-router`, `zustand`
- **Health Connect rate limiting:** <https://developer.android.com/health-and-fitness/health-connect/rate-limiting> — documents the limit *structure* (periodic + daily, foreground vs. background) but publishes no numeric quotas; recommends changelog tokens over raw reads (see D2)
- **Local reference files:** `its-a-rock/jest.config.js`, `its-a-rock/package.json`, `its-a-rock/plugins/`, `its-a-rock/.github/workflows/android-apk-release.yml`
