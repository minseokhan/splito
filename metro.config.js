const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
// Expo Router는 app/ 아래 모든 파일을 라우트로 번들한다. 화면 테스트(app/**/__tests__)는 번들에서 뺀다.
config.resolver.blockList = [/\/app\/.*__tests__\/.*/];

module.exports = withNativeWind(config, { input: './global.css' });
