const { withProjectBuildGradle } = require('@expo/config-plugins');

// Expo 55's ExpoRootProjectPlugin uses setIfNotExist for compileSdkVersion,
// buildToolsVersion and minSdkVersion, deriving buildTools as
// "${compileSdk}.0.0". Injecting them into ext before the plugin applies wins,
// so we can keep compileSdk 36 while pinning buildTools to 35.0.0 whose AAPT2
// correctly accepts @null color values used by material components (buildTools
// 36.0.0 rejects them).
//
// minSdkVersion is raised to 26 for this app: Health Connect requires API 26+,
// and Expo's default of 24 would fail at install time on the
// react-native-health-connect module. Kept here rather than in a separate
// plugin so all the root-project ext injection stays in one place.
module.exports = function withAndroidCompileSdk(
  config,
  { compileSdkVersion = 36, buildToolsVersion = '35.0.0', minSdkVersion = 26 } = {},
) {
  return withProjectBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (/compileSdkVersion\s*=\s*\d+/.test(contents)) {
      // Future-proof: if Expo ever writes it as text, update in place.
      contents = contents.replace(
        /compileSdkVersion\s*=\s*\d+/,
        `compileSdkVersion = ${compileSdkVersion}`,
      );
      if (/minSdkVersion\s*=\s*\d+/.test(contents)) {
        contents = contents.replace(
          /minSdkVersion\s*=\s*\d+/,
          `minSdkVersion = ${minSdkVersion}`,
        );
      }
    } else {
      // Current Expo 55 behaviour: these values are set dynamically by
      // ExpoRootProjectPlugin via setIfNotExist. Injecting them here first
      // causes setIfNotExist to skip its defaults.
      contents = contents.replace(
        'apply plugin: "expo-root-project"',
        `ext { compileSdkVersion = ${compileSdkVersion}; buildToolsVersion = "${buildToolsVersion}"; minSdkVersion = ${minSdkVersion} }\napply plugin: "expo-root-project"`,
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};
