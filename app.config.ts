import type { ExpoConfig } from "expo/config";

const APP_ID = "app.splito"; // 가칭
const LINK_DOMAIN = process.env.EXPO_PUBLIC_LINK_DOMAIN ?? "splito.vercel.app";

const config: ExpoConfig = {
  name: "스플리토",
  slug: "splito",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "splito",
  userInterfaceStyle: "light",
  ios: {
    icon: "./assets/expo.icon",
    bundleIdentifier: APP_ID,
    associatedDomains: [`applinks:${LINK_DOMAIN}`],
  },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: LINK_DOMAIN, pathPrefix: "/i/" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    ["expo-build-properties", { ios: { deploymentTarget: "16.4" } }],
    [
      "expo-image-picker",
      {
        cameraPermission: "영수증을 찍어 지출을 기록하려면 카메라 권한이 필요해요.",
        photosPermission: "영수증·결제 캡처를 불러오려면 사진 접근 권한이 필요해요.",
      },
    ],
    [
      "expo-speech-recognition",
      {
        microphonePermission: "말로 지출을 기록하려면 마이크 권한이 필요해요.",
        speechRecognitionPermission: "말한 내용을 글자로 바꾸려면 음성 인식 권한이 필요해요.",
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#208AEF",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
  ],
  extra: {
    eas: { projectId: "8ea12de8-06e1-4858-84b4-5d5729527706" },
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
