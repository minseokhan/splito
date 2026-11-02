// reanimated는 네이티브 worklets 모듈이 있어야 로드돼 jest에서 그대로는 못 쓴다.
// 애니메이션은 빼고 평범한 View로 바꿔 끼운다(Toast·ExpenseCard·BottomSheet가 쓴다).
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const stub = {};
  stub.duration = () => stub;
  return { __esModule: true, default: { View }, FadeIn: stub, FadeOut: stub, SlideInDown: stub, SlideOutDown: stub };
});
