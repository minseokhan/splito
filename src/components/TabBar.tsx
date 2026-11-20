import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors } from '@/theme/tokens';

type Tab = 'home' | 'stats';

const HomeGlyph = ({ color, filled }: { color: string; filled: boolean }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={2.2} strokeLinejoin="round">
    <Path d="M4 10.2L12 4l8 6.2V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z" />
  </Svg>
);

const StatsGlyph = ({ color, filled }: { color: string; filled: boolean }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={4} y={12} width={4} height={8} rx={1.2} fill={filled ? color : 'none'} />
    <Rect x={10} y={7} width={4} height={13} rx={1.2} fill={filled ? color : 'none'} />
    <Rect x={16} y={4} width={4} height={16} rx={1.2} fill={filled ? color : 'none'} />
  </Svg>
);

function TabItem({ label, active, onPress, Glyph }: { label: string; active: boolean; onPress: () => void; Glyph: typeof HomeGlyph }) {
  const fg = active ? colors.ink.DEFAULT : colors.ink[400];
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      // 시안: 선택 탭 배경 rgba(19,25,39,.06)
      style={{ backgroundColor: active ? 'rgba(19,25,39,0.06)' : 'transparent' }}
      className="mx-1 h-14 flex-1 items-center justify-center gap-px rounded-full"
    >
      <Glyph color={fg} filled={active} />
      <Text style={{ color: fg, lineHeight: 16 }} className="font-semibold text-xs">
        {label}
      </Text>
    </Pressable>
  );
}

// 시안 03 하단 탭바: 흰 페이드 130 + 떠 있는 pill(좌우 20, 높이 68) 안에 홈 · 가운데 + · 통계.
// 스크롤 콘텐츠는 하단 130 여백을 둔다.
export function TabBar({ current, onAdd }: { current: Tab; onAdd: () => void }) {
  const insets = useSafeAreaInsets();
  const go = (to: Tab) => {
    if (to === current) return;
    if (to === 'stats') router.push('/stats');
    else if (router.canGoBack()) router.back();
    else router.replace('/home');
  };
  return (
    <>
      <Svg pointerEvents="none" width="100%" height={130} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <Defs>
          <LinearGradient id="tabfade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0.9} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#tabfade)" />
      </Svg>
      <View
        accessibilityRole="tablist"
        className="absolute left-5 right-5 h-[68px] flex-row items-center rounded-full px-1.5"
        style={{
          bottom: Math.max(insets.bottom - 8, 16),
          // 시안은 rgba(255,255,255,.78) + backdrop blur(20). RN엔 블러가 없어 불투명도를 올렸다.
          backgroundColor: 'rgba(255,255,255,0.94)',
          borderWidth: 1,
          borderColor: 'rgba(19,25,39,0.06)',
          boxShadow: '0 10px 32px -6px rgba(19,25,39,.16), 0 2px 6px -2px rgba(19,25,39,.08)',
        }}
      >
        <TabItem label="홈" active={current === 'home'} onPress={() => go('home')} Glyph={HomeGlyph} />
        <View className="flex-1 items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="지출 올리기"
            onPress={onAdd}
            // 원본: 배경 #1272BF(primary-text), 그림자 rgba(18,114,191,.4), 눌림은 1px 아래로만.
            style={{ marginTop: -22, borderWidth: 4, borderColor: '#FFFFFF', boxShadow: '0 10px 20px -6px rgba(18,114,191,.4)' }}
            className="h-[60px] w-[60px] items-center justify-center rounded-full bg-primary-text active:translate-y-px"
          >
            <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={colors.primary.on} strokeWidth={2.6} strokeLinecap="round">
              <Path d="M12 5v14M5 12h14" />
            </Svg>
          </Pressable>
        </View>
        <TabItem label="통계" active={current === 'stats'} onPress={() => go('stats')} Glyph={StatsGlyph} />
      </View>
    </>
  );
}
