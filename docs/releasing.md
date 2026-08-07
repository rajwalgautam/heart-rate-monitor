# Releasing a new version

Heart Rate Monitor is released as a signed Android APK published as a **GitHub
Release in this repo** (`rajwalgautam/heart-rate-monitor`). Releases are cut by
the **CI / Release** GitHub Actions workflow
([`.github/workflows/android-apk-release.yml`](../.github/workflows/android-apk-release.yml)),
triggered manually once changes are merged to `main`.

The process is identical to `its-a-rock`: same-repo releases using the
workflow's built-in `GITHUB_TOKEN`. There is **no** `RELEASE_REPO_TOKEN`, and —
unlike `its-a-rock` — no `RELEASE_DEPLOY_KEY` either (see below).

## Status: not yet operational

The workflow and plugins are in place, but a release **cannot be cut until the
one-time setup below is done**. It needs a locally generated keystore and four
repository secrets, so it is a human task.

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

Four secrets, one keystore. Budget about ten minutes.

> **The keystore is not recoverable.** Android identifies an app by its signing
> key, so if you lose this file or its passwords, you cannot ship an update to
> any device that already has the app installed — users must uninstall and
> reinstall, losing their local session history. Back up the `.jks` and both
> passwords to a password manager **before** cutting the first release.

### 1. Generate the release keystore

Generate a **new** keystore for this app; do not reuse `its-a-rock`'s. It must
never be committed — `.gitignore` already excludes `*.jks`, `*.keystore`, and
`*.credentials`.

`keytool` ships with a JDK. macOS's `/usr/bin/keytool` is a stub that fails with
*"Unable to locate a Java Runtime"*. Android Studio bundles a real JDK, which is
the path used below; a standalone JDK 17 (`brew install --cask temurin@17`) works
equally well and is needed anyway for local release builds.

Generate a strong password first and save it before continuing — the same value
is used for both the store and the key, which keeps the Gradle config simple and
loses nothing (a distinct key password protects against nothing here, since both
live in the same secret store):

```sh
KEYSTORE_PASSWORD="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"
echo "$KEYSTORE_PASSWORD"   # save this to your password manager NOW
```

Then, from the repo root:

```sh
"/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool" \
  -genkeypair -v \
  -keystore heart-rate-monitor-release.jks \
  -alias heart-rate-monitor \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$KEYSTORE_PASSWORD" \
  -keypass "$KEYSTORE_PASSWORD" \
  -dname "CN=Heart Rate Monitor, OU=Personal, O=rajwalgautam, L=, ST=, C=US"
```

`-validity 10000` is ~27 years; a key that expires cannot sign updates, so it is
deliberately long. Adjust `-dname` if you want different certificate metadata —
it is cosmetic for a self-distributed APK.

Verify it:

```sh
"/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool" \
  -list -v -keystore heart-rate-monitor-release.jks \
  -storepass "$KEYSTORE_PASSWORD" | head -20
```

### 2. Add repository secrets

Four secrets. `gh secret set` reads from stdin, so no value is written to shell
history or to a file:

```sh
# 1. The keystore itself, base64-encoded.
#    macOS `base64 -i` emits a single line already — no line-unwrapping needed.
base64 -i heart-rate-monitor-release.jks | gh secret set KEYSTORE_BASE64

# 2 & 3. Store and key passwords (same value, per above).
printf '%s' "$KEYSTORE_PASSWORD" | gh secret set KEYSTORE_PASSWORD
printf '%s' "$KEYSTORE_PASSWORD" | gh secret set KEY_PASSWORD

# 4. The alias used at generation time.
printf '%s' 'heart-rate-monitor' | gh secret set KEY_ALIAS
```

Confirm all four landed:

```sh
gh secret list
```

| Secret              | Consumed at                                     |
| ------------------- | ----------------------------------------------- |
| `KEYSTORE_BASE64`   | *Write release keystore* step — decoded to `android/app/release.keystore` |
| `KEYSTORE_PASSWORD` | `assembleRelease`, via `plugins/withAndroidSigning.js` |
| `KEY_ALIAS`         | as above                                        |
| `KEY_PASSWORD`      | as above                                        |

Then clear the password from your shell: `unset KEYSTORE_PASSWORD`.

### `RELEASE_DEPLOY_KEY` — not needed for this repo

The workflow's checkout step passes `ssh-key: ${{ secrets.RELEASE_DEPLOY_KEY }}`,
inherited from `its-a-rock`. **You do not need to set it here.**

That secret exists in `its-a-rock` because that repo has a "Protect main" ruleset
requiring pull requests, which the default `GITHUB_TOKEN` cannot push past — so
the release commit goes over SSH as a deploy key with a ruleset bypass.

This repository is **public**, so `main` has no ruleset or branch protection by
default, and the `create-tag` job's `permissions: contents: write` is
sufficient for `GITHUB_TOKEN` to push the version bump directly. When the
secret is unset it interpolates to an empty string, and `actions/checkout`
falls back to token authentication.

Set it only if one of these later becomes true:

- you add a ruleset or branch protection on `main`; or
- you start requiring pull requests for `main`.

(The repo was private until 2026-08-07, which is why it's mentioned here at
all — see "In-app updates" below for why it was made public.)

If you do need it:

```sh
ssh-keygen -t ed25519 -C "heart-rate-monitor release" -f /tmp/hrm-release-key -N ""
gh repo deploy-key add /tmp/hrm-release-key.pub --title "release" --allow-write
gh secret set RELEASE_DEPLOY_KEY < /tmp/hrm-release-key
rm -f /tmp/hrm-release-key /tmp/hrm-release-key.pub
```

…then grant that deploy key a bypass on the protection rule.

### 3. Verify the first build

Write `changelogs/v0.0.1.md` (the workflow fails without it), then dispatch the
workflow with `v0.0.1` and confirm a signed APK is attached to the resulting
Release before relying on the pipeline. Check the signature on the downloaded
artifact:

```sh
"/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool" \
  -printcert -jarfile app-release.apk
```

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

This only works because the repo is **public**. The checker calls the GitHub
API unauthenticated — no token is shipped in the app — and the releases API
returns 404 for an unauthenticated request against a *private* repo (to avoid
leaking its existence), indistinguishable from "no releases yet." The repo was
private through 2026-08-06, which made every in-app update check fail with
"Could not reach GitHub." It was switched to public on 2026-08-07 specifically
to fix this; keep it public, or give the checker an authenticated request path,
if you ever reintroduce privacy.

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
