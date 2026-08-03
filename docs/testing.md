# Testing

Two Jest projects, mirroring `its-a-rock` and `water-tracker`.

| Project | Preset     | Env   | Tests                        | Notes                                                          |
| ------- | ---------- | ----- | ---------------------------- | -------------------------------------------------------------- |
| `unit`  | `ts-jest`  | node  | `**/__tests__/**/*.test.ts`  | RN + native modules mocked via `src/__mocks__/`. Fast.          |
| `ui`    | `jest-expo`| jsdom | `**/__tests__/**/*.test.tsx` | Real RN via React Native Testing Library.                       |

Convention: **`.test.ts` → unit, `.test.tsx` → ui.**

```bash
npm test                        # both projects
npx jest --selectProjects unit  # just the fast ones
npm run typecheck               # tsc --noEmit
```

CI runs `npm run typecheck` and `npm test` on every push to `main` and on PRs.

## What's covered

All of the load-bearing logic lives in the `unit` project:

| Area                | File                                | Why it matters                                                                                                 |
| ------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| BLE packet parsing  | `__tests__/ble/utils.test.ts`         | 8-bit vs 16-bit format flag, little-endian byte order, the 255 BPM boundary, truncated and empty buffers.        |
| Baseline math       | `__tests__/healthconnect/utils.test.ts` | Flattening nested `samples` arrays, the 24h window boundary, and `null` (never `NaN`) for empty input.        |
| Baseline polling    | `__tests__/store/useBaselineStore.test.ts` | The 30s interval, manual-refresh debounce, dedupe on unchanged samples, and rate-limit backoff.           |
| Connection lifecycle| `__tests__/store/useHeartRateStore.test.ts` | State transitions, session accumulator, and idempotent teardown.                                          |
| Formatting          | `__tests__/utils/format.test.ts`      | Duration, relative time, baseline delta, version comparison.                                                    |

Two of these deserve specific mention because they encode decisions rather than
mechanics:

- **Per-sample vs per-record averaging.** `calculateBaseline` has a test that
  fails if the mean is taken per `HeartRateRecord` instead of per flattened
  sample. That bug produces a plausible-looking wrong number, so it is asserted
  explicitly rather than left to inspection.
- **Idempotent teardown.** `useHeartRateStore` is tested for repeated
  `teardown()` calls disposing each handle exactly once. Redundant teardown is
  the normal case in practice (navigate away while scanning, background during a
  session), not an edge case.

## Known limitation: `ui` rendering is currently blocked

The `ui` harness is wired up, but React Native host components (`View`, `Text`)
currently render to a null stub under jest-expo ~55 + React Native 0.83 (new
architecture), so RNTL queries find nothing. This is inherited from the sibling
repos — `its-a-rock` and `water-tracker` document and skip the same test.

Consequently:

- [`__tests__/components/harness.test.tsx`](../__tests__/components/harness.test.tsx)
  keeps a render smoke test `.skip`-ped. **Un-skip this one first** — it is the
  canary.
- [`BaselineStatCard.test.tsx`](../__tests__/components/BaselineStatCard.test.tsx)
  and [`LiveHeartRateCard.test.tsx`](../__tests__/components/LiveHeartRateCard.test.tsx)
  are written in full and `describe.skip`-ped for the same reason. They assert
  real behaviour (the stale-but-visible baseline, the Health Connect degraded
  path, the live-vs-baseline delta) and should pass unchanged once rendering
  works.

`unit` tests are unaffected, which is why the presentation logic those cards
display (`formatBaselineDelta`, `formatRelativeTime`) is factored into
`src/utils/format.ts` and tested there directly.

## Mocks

`src/__mocks__/` holds substitutes for every native module, wired through
`moduleNameMapper` in `jest.config.js`:

- `expo-sqlite`, `expo-haptics`, `async-storage`, `expo-router`,
  `expo-constants`, `expo-status-bar`, `expo` — ported from `its-a-rock`.
- `react-native` — full stub, `unit` project only.
- `react-native-ble-plx` — exposes `__bleMock` so a spec can push characteristic
  values and inspect scan/connect calls.
- `react-native-health-connect` — exposes `__hcMock` for records, SDK status, and
  forcing read errors (e.g. rate limiting).
- `@expo/vector-icons` — icons reach for `RNVectorIconsManager`, which does not
  exist under jsdom; they render as nothing.

Store tests mock at the module boundary (`jest.mock('@/ble/BleManager')`) rather
than through the library mock, so they exercise store logic against the façade's
contract rather than ble-plx's API shape.
