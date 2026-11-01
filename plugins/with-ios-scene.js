// iOS 27 SDK는 UIScene 라이프사이클을 채택하지 않은 앱을 실행 즉시 중단시킨다
// (_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption → EXC_BREAKPOINT).
// Expo SDK 57의 prebuild 템플릿은 아직 AppDelegate에서 직접 window를 만들기 때문에
// expo가 이미 제공하는 ExpoAppSceneDelegate(EXExpoAppSceneDelegate)로 배선해 준다.
// SDK 58에서 템플릿이 이 일을 하게 되면 이 플러그인은 제거한다.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
      },
    ],
  },
};

const CONFORMANCE = 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';

// scene delegate가 window 생성과 startReactNative를 대신하므로 AppDelegate에서 들어낸다.
const STARTUP_BLOCK = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function adoptSceneLifecycle(contents) {
  if (contents.includes('ExpoReactNativeFactoryProvider')) {
    return contents;
  }
  if (!contents.includes('class AppDelegate: ExpoAppDelegate {')) {
    throw new Error(
      'with-ios-scene: AppDelegate.swift가 예상한 형태가 아니다. Expo 템플릿이 바뀌었는지 확인할 것.'
    );
  }
  return contents
    .replace('class AppDelegate: ExpoAppDelegate {', CONFORMANCE)
    .replace(STARTUP_BLOCK, '\n');
}

const withIosScene = (config) => {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return cfg;
  });
  return withAppDelegate(config, (cfg) => {
    cfg.modResults.contents = adoptSceneLifecycle(cfg.modResults.contents);
    return cfg;
  });
};

module.exports = withIosScene;
module.exports.adoptSceneLifecycle = adoptSceneLifecycle;
module.exports.SCENE_MANIFEST = SCENE_MANIFEST;
