const { adoptSceneLifecycle, SCENE_MANIFEST } = require('../with-ios-scene');

const TEMPLATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

describe('adoptSceneLifecycle', () => {
  it('AppDelegate가 ExpoReactNativeFactoryProvider를 따르게 한다', () => {
    expect(adoptSceneLifecycle(TEMPLATE)).toContain(
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {'
    );
  });

  it('window 생성과 startReactNative 호출을 제거한다 — scene delegate가 대신 한다', () => {
    const out = adoptSceneLifecycle(TEMPLATE);
    expect(out).not.toContain('UIWindow(frame: UIScreen.main.bounds)');
    expect(out).not.toContain('startReactNative');
  });

  it('factory를 보관하는 프로퍼티는 남긴다 — scene delegate가 읽어간다', () => {
    const out = adoptSceneLifecycle(TEMPLATE);
    expect(out).toContain('var reactNativeFactory: RCTReactNativeFactory?');
    expect(out).toContain('reactNativeFactory = factory');
    expect(out).toContain('var window: UIWindow?');
  });

  it('이미 적용된 파일은 그대로 둔다', () => {
    const once = adoptSceneLifecycle(TEMPLATE);
    expect(adoptSceneLifecycle(once)).toBe(once);
  });

  it('기대한 형태가 아니면 조용히 넘기지 않고 던진다', () => {
    expect(() => adoptSceneLifecycle('class Other {}')).toThrow(/AppDelegate/);
  });

  it('scene manifest가 Expo의 scene delegate를 가리킨다', () => {
    const role = SCENE_MANIFEST.UISceneConfigurations.UIWindowSceneSessionRoleApplication;
    expect(SCENE_MANIFEST.UIApplicationSupportsMultipleScenes).toBe(false);
    expect(role[0].UISceneDelegateClassName).toBe('EXExpoAppSceneDelegate');
  });
});
