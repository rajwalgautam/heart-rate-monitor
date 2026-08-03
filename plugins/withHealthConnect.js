const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

// Health Connect manifest plumbing — implementation.md D4.
//
// Three things are required beyond declaring the READ_HEART_RATE permission in
// app.json, and Health Connect silently rejects the permission request without
// the first:
//
//   1. A permissions-rationale activity: an intent filter Health Connect
//      launches to ask the app to explain *why* it wants health data. Declared
//      here as an alias onto MainActivity, which routes into the running app.
//   2. The API 34+ rationale intent filter, which moved to an <activity-alias>.
//   3. <queries> entries, so the app can detect whether the Health Connect
//      package exists at all on this device (needed for the degraded path).
//
// react-native-health-connect ships its own config plugin covering some of
// this; this plugin is written to be idempotent and additive so the two do not
// fight if both are applied.

const RATIONALE_ACTION = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';
const RATIONALE_ACTION_V2 =
  'android.intent.action.VIEW_PERMISSION_USAGE';
const HEALTH_PERMISSIONS_CATEGORY = 'android.intent.category.HEALTH_PERMISSIONS';
const HC_PACKAGE = 'com.google.android.apps.healthdata';

module.exports = function withHealthConnect(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    addRationaleIntentFilter(application);
    addRationaleAlias(application);
    addQueries(manifest);

    return config;
  });
};

/** API < 34: the rationale intent filter sits on MainActivity itself. */
function addRationaleIntentFilter(application) {
  const activities = application.activity ?? [];
  const main = activities.find(
    (a) => a.$?.['android:name'] === '.MainActivity',
  );
  if (main === undefined) return;

  main['intent-filter'] = main['intent-filter'] ?? [];
  const exists = main['intent-filter'].some((filter) =>
    (filter.action ?? []).some((a) => a.$?.['android:name'] === RATIONALE_ACTION),
  );
  if (exists) return;

  main['intent-filter'].push({
    action: [{ $: { 'android:name': RATIONALE_ACTION } }],
  });
}

/** API 34+: the rationale moved to a dedicated activity-alias. */
function addRationaleAlias(application) {
  application['activity-alias'] = application['activity-alias'] ?? [];
  const exists = application['activity-alias'].some(
    (alias) => alias.$?.['android:name'] === 'ViewPermissionUsageActivity',
  );
  if (exists) return;

  application['activity-alias'].push({
    $: {
      'android:name': 'ViewPermissionUsageActivity',
      'android:exported': 'true',
      'android:targetActivity': '.MainActivity',
      'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
    },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': RATIONALE_ACTION_V2 } }],
        category: [{ $: { 'android:name': HEALTH_PERMISSIONS_CATEGORY } }],
      },
    ],
  });
}

/**
 * Package visibility. Without this, Android 11+ package-visibility filtering
 * hides the Health Connect app, and availability detection reports "not
 * installed" on devices where it is present.
 */
function addQueries(manifest) {
  manifest.manifest.queries = manifest.manifest.queries ?? [];
  const already = manifest.manifest.queries.some((q) =>
    (q.package ?? []).some((p) => p.$?.['android:name'] === HC_PACKAGE),
  );
  if (already) return;

  manifest.manifest.queries.push({
    package: [{ $: { 'android:name': HC_PACKAGE } }],
  });
}
