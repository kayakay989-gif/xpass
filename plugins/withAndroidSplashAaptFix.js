const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * AAPT fails if android:windowSplashScreenBehavior=base appears in merged values-v31 XML.
 * Use values-v31 Theme.App.SplashScreen + transparent animated icon instead (no Java Window API:
 * setSplashScreenBehavior is not visible to this project's Kotlin compile classpath on EAS).
 */
function withAndroidSplashAaptFix(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const resDir = path.join(root, 'app', 'src', 'main', 'res');
      const v31Dir = path.join(resDir, 'values-v31');
      const drawableDir = path.join(resDir, 'drawable');
      fs.mkdirSync(v31Dir, { recursive: true });
      fs.mkdirSync(drawableDir, { recursive: true });

      fs.writeFileSync(
        path.join(drawableDir, 'splash_transparent_icon.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <size android:width="1dp" android:height="1dp" />
  <solid android:color="#00000000" />
</shape>
`,
        'utf8'
      );

      fs.writeFileSync(
        path.join(v31Dir, 'styles.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools">
  <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">
    <item name="windowSplashScreenBackground">@color/splashscreen_background</item>
    <item name="windowSplashScreenAnimatedIcon">@drawable/splash_transparent_icon</item>
    <item name="postSplashScreenTheme">@style/AppTheme</item>
  </style>
</resources>
`,
        'utf8'
      );

      const v33Styles = path.join(resDir, 'values-v33', 'styles.xml');
      if (fs.existsSync(v33Styles)) {
        fs.unlinkSync(v33Styles);
      }

      return cfg;
    },
  ]);
}

module.exports = withAndroidSplashAaptFix;
