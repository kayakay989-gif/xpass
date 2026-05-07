const { withPodfile } = require("expo/config-plugins");

const TARGET_PODS = [
  "react-native-maps",
  "react-native-google-maps",
  "Google-Maps-iOS-Utils",
];
const MAP_PODS = ["react-native-maps", "react-native-google-maps"];
const RNFB_PODS = ["RNFBApp", "RNFBAuth"];

const withIosNonModularHeadersFix = (config) =>
  withPodfile(config, (mod) => {
    let contents = mod.modResults.contents;

    if (contents.includes("withIosNonModularHeadersFix")) {
      return mod;
    }

    const marker = "post_install do |installer|";
    const index = contents.indexOf(marker);
    if (index === -1) {
      return mod;
    }

    const injection = `
  # withIosNonModularHeadersFix
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      # Needed for Firebase + React Native headers when static frameworks are enabled.
      config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 12.0
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '12.0'
      end
      if ${JSON.stringify(MAP_PODS)}.include?(target.name)
        # Keep map pods in non-modular compatibility mode for static frameworks.
        config.build_settings['CLANG_ENABLE_MODULES'] = 'NO'
        config.build_settings['DEFINES_MODULE'] = 'NO'
      end
      if ${JSON.stringify(RNFB_PODS)}.include?(target.name)
        # Keep RNFirebase pods from failing with React non-modular header imports.
        config.build_settings['DEFINES_MODULE'] = 'NO'
        config.build_settings['CLANG_WARN_NON_MODULAR_INCLUDE_IN_FRAMEWORK_MODULE'] = 'NO'
        config.build_settings['OTHER_CFLAGS'] = '$(inherited) -Wno-non-modular-include-in-framework-module'
      end
    end

    if ${JSON.stringify(TARGET_PODS)}.include?(target.name)
      target.build_configurations.each do |config|
        # Keep this explicit for known problematic pods.
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end
  end

  gmu_header = File.join(
    installer.sandbox.root.to_s,
    'Google-Maps-iOS-Utils',
    'Sources',
    'GoogleMapsUtilsObjC',
    'include',
    'GMUWeightedLatLng.h'
  )
  if File.exist?(gmu_header)
    gmu_contents = File.read(gmu_header)
    patched = gmu_contents.gsub('@import GoogleMaps;', '#import <GoogleMaps/GoogleMaps.h>')
    if patched != gmu_contents
      File.write(gmu_header, patched)
    end
  end
`;

    const insertAt = index + marker.length;
    contents = `${contents.slice(0, insertAt)}${injection}${contents.slice(insertAt)}`;
    mod.modResults.contents = contents;
    return mod;
  });

module.exports = withIosNonModularHeadersFix;
