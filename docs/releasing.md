# Releasing a new version

Heart Rate Monitor is released as a signed Android APK published as a **GitHub
Release in this repo** (`rajwalgautam/heart-rate-monitor`). Releases are cut by
the **CI / Release** GitHub Actions workflow
([`.github/workflows/android-apk-release.yml`](../.github/workflows/android-apk-release.yml)),
triggered manually once changes are merged to `main`.

The process is identical to `its-a-rock`: same-repo releases using the
workflow's built-in `GITHUB_TOKEN`. There is **no** `RELEASE_REPO_TOKEN`.

## Status: not yet operational

The workflow and plugins are in place, but a release **cannot be cut until the
one-time setup below is done**. That setup requires access to the GitHub
repository settings and a locally generated keystore, so it is a human task.

## Versioning

- Dispatch a **base version** `vMAJOR.MINOR.PATCH` (e.g. `v0.1.0`). The workflow
  appends the unix time of the dispatch, so the tag, Release, and app version
  become `v0.1.0-<epoch>`. Every release is unique and monotonically increasing —
  re-releasing is just dispatching the same base version again.
- **Do not edit `app.json` by hand.** The workflow commits the version +
  `versionCode` bump (`chore(release): vX.Y.Z-<epoch> [skip ci]`) and pushes it
  to both `main` and the tag.
- The Android `versionCode` is the epoch itself: unique, monotonic, within the
  32-bit limit until January 2038.
- One changelog file per **base** version in `changelogs/`, named `vX.Y.Z.md` —
  the time suffix is never part of the filename.

## One-time setup (required, not yet done)

### 1. Generate the release keystore

Must **not** be committed — `.gitignore` already excludes `*.jks`, `*.keystore`,
and `*.credentials`. Generate a **new** keystore for this app; do not reuse
`its-a-rock`'s.

`keytool` ships with a JDK. macOS's stub `/usr/bin/java` fails with *"Unable to
locate a Java Runtime"* until a real JDK is present:

```sh
"/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool" \
  -genkeypair -v \
  -keystore heart-rate-monitor-release.jks \
  -alias heart-rate-monitor \
  -keyalg RSA -keysize 2048 -validity 10000
```

Or with a standalone JDK 17 (`brew install --cask temurin@17`).

### 2. Add repository secrets

| Secret               | Value                                                     |
| -------------------- | --------------------------------------------------------- |
| `KEYSTORE_BASE64`    | `base64 -i heart-rate-monitor-release.jks \| pbcopy`       |
| `KEYSTORE_PASSWORD`  | The store password chosen above                            |
| `KEY_ALIAS`          | `heart-rate-monitor`                                       |
| `KEY_PASSWORD`       | The key password chosen above                              |
| `RELEASE_DEPLOY_KEY` | Write deploy key, to push the version bump past branch protection |

`RELEASE_DEPLOY_KEY` is needed because `GITHUB_TOKEN` cannot push past a
required-PR ruleset. Add the public half as a deploy key with write access, and
give it a bypass on the "Protect main" ruleset.

### 3. Verify the first build

Dispatch the workflow with a throwaway base version and confirm the APK is
attached to the resulting Release before relying on it.

## Cutting a release

1. Merge your changes to `main`.
2. Write `changelogs/vX.Y.Z.md` for the base version. The workflow **fails** if
   this file is missing.
3. Actions → **CI / Release** → *Run workflow* → enter the base version
   (`v0.1.0`).
4. The workflow runs tests + typecheck, bumps `app.json`, tags, prebuilds,
   builds a signed APK, and publishes the Release.

## In-app updates

`src/utils/updateChecker.ts` points at this repository's releases API
(`RELEASES_REPO = 'rajwalgautam/heart-rate-monitor'`). The
[`UpdateBanner`](../src/components/UpdateBanner.tsx) checks on launch and prompts
once per newer version. Every failure path degrades to rendering nothing — the
app is offline-first, so a failed update check must never surface as an error.

Note that until the first release exists, the GitHub releases API returns 404 and
the banner silently renders nothing. That is the intended behaviour, not a bug.

## Build configuration notes

- `minSdkVersion` is raised to **26** in
  [`plugins/withAndroidCompileSdk.js`](../plugins/withAndroidCompileSdk.js) —
  Health Connect requires API 26+, above Expo's default of 24.
- [`plugins/withHealthConnect.js`](../plugins/withHealthConnect.js) injects the
  permissions-rationale activity, the API 34+ `activity-alias`, and the
  `<queries>` entry for Health Connect package visibility. Without the rationale
  filter, Health Connect rejects the permission request outright.
- `reactNativeArchitectures` is pinned to `arm64-v8a` in
  [`plugins/withGradleProperties.js`](../plugins/withGradleProperties.js), which
  cuts native compile time roughly 4×.
