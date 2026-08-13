const {
  withAppBuildGradle,
  withAndroidManifest,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin for Google Pay on Android:
 * - play-services-wallet dependency
 * - GOOGLE_PAY_ENVIRONMENT BuildConfig (PRODUCTION after console approval)
 * - wallet API manifest meta-data
 * - GooglePayPackage registration in MainApplication.kt
 */
function withGooglePayBuildConfig(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    if (!contents.includes('GOOGLE_PAY_ENVIRONMENT')) {
      contents = contents.replace(
        /(buildConfigField\s+"String",\s+"REACT_NATIVE_RELEASE_LEVEL"[^\n]*\n)/,
        `$1        def googlePayEnv = findProperty('GOOGLE_PAY_ENVIRONMENT') ?: 'PRODUCTION'\n        buildConfigField "String", "GOOGLE_PAY_ENVIRONMENT", "\\"\${googlePayEnv}\\""\n`
      );
    }

    if (!contents.includes('play-services-wallet')) {
      const dependenciesRegex = /dependencies\s*\{([^}]*)\}/;
      const dependenciesMatch = contents.match(dependenciesRegex);
      if (dependenciesMatch) {
        const newBlock = dependenciesMatch[0].replace(
          /(\s*)\}/,
          `$1    implementation 'com.google.android.gms:play-services-wallet:19.5.0'\n$1}`
        );
        contents = contents.replace(dependenciesRegex, newBlock);
      }
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

function withGooglePayManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) return cfg;

    application['meta-data'] = application['meta-data'] || [];
    const hasWallet = application['meta-data'].some(
      (entry) => entry.$?.['android:name'] === 'com.google.android.gms.wallet.api.enabled'
    );
    if (!hasWallet) {
      application['meta-data'].push({
        $: {
          'android:name': 'com.google.android.gms.wallet.api.enabled',
          'android:value': 'true',
        },
      });
    }
    return cfg;
  });
}

function withGooglePayMainApplication(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const packageName = cfg.android?.package || 'com.xpass.unique';
      const packagePath = packageName.replace(/\./g, path.sep);
      const mainAppPath = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        packagePath,
        'MainApplication.kt'
      );

      if (!fs.existsSync(mainAppPath)) {
        return cfg;
      }

      let contents = fs.readFileSync(mainAppPath, 'utf8');
      if (!contents.includes('GooglePayPackage()')) {
        contents = contents.replace(
          /PackageList\(this\)\.packages\.apply\s*\{/,
          `PackageList(this).packages.apply {
              add(GooglePayPackage())`
        );
        fs.writeFileSync(mainAppPath, contents);
      }
      return cfg;
    },
  ]);
}

function withGooglePay(config) {
  if (!config.android) {
    return config;
  }
  config = withGooglePayBuildConfig(config);
  config = withGooglePayManifest(config);
  config = withGooglePayMainApplication(config);
  return config;
}

module.exports = withGooglePay;
