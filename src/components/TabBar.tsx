import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors } from '@/theme/tokens';

// 시안 03·18 하단의 떠 있는 pill. 라우터 구조는 그대로 두고 홈·통계 화면에서 직접 렌더한다.
// 수치는 전부 프로토타입 1a(showTabBar 블록) 인라인 style 실측.
const ACTIVE_BG = 'rgba(19,25,39,0.06)';

type GlyphProps = { on: boolean; color: string };

const HomeGlyph = ({ on, color }: GlyphProps) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill={on ? color : 'none'} stroke={color} strokeWidth={2.2} strokeLinejoin="round">
    <Path d="M4 10.2L12 4l8 6.2V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z" />
  </Svg>
);

const StatsGlyph = ({ on, color }: GlyphProps) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={4} y={12} width={4} height={8} rx={1.2} fill={on ? color : 'none'} />
    <Rect x={10} y={7} width={4} height={13} rx={1.2} fill={on ? color : 'none'} />
    <Rect x={16} y={4} width={4} height={16} rx={1.2} fill={on ? color : 'none'} />
  </Svg>
);

function Tab({ label, on, onPress, Glyph }: { label: string; on: boolean; onPress: () => void; Glyph: (p: GlyphProps) => React.ReactElement }) {
  const color = on ? colors.ink.DEFAULT : colors.ink[400];
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      className="mx-1 h-14 flex-1 items-center justify-center gap-px rounded-[28px]"
      style={{ backgroundColor: on ? ACTIVE_BG : 'transparent' }}
    >
      <Glyph on={on} color={color} />
      <Text className={`font-semibold text-xs ${on ? 'text-ink' : 'text-ink-400'}`}>{label}</Text>
    </Pressable>
  );
}

export function TabBar({ active, onAdd }: { active: 'home' | 'stats'; onAdd: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <Svg pointerEvents="none" width="100%" height={130} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <Defs>
          <LinearGradient id="tabfade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.9} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#tabfade)" />
      </Svg>
      <View
        className="absolute left-5 right-5 h-[68px] flex-row items-center rounded-[34px] px-1.5"
        style={{
          bottom: Math.max(insets.bottom, 26),
          // RN에는 backdrop-filter가 없다 → 시안의 blur(20) + .78 대신 불투명도를 올려 글자가 비치지 않게 한다.
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderWidth: 1,
          borderColor: 'rgba(19,25,39,0.06)',
          boxShadow: '0 10px 32px -6px rgba(19,25,39,.16), 0 2px 6px -2px rgba(19,25,39,.08)',
        }}
      >
        <Tab label="홈" on={active === 'home'} onPress={() => router.navigate('/home')} Glyph={HomeGlyph} />
        <View className="flex-1 items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="지출 올리기"
            onPress={onAdd}
            className="h-[60px] w-[60px] items-center justify-center rounded-full border-4 border-white bg-primary active:translate-y-px"
            style={{ marginTop: -22, boxShadow: '0 10px 20px -6px rgba(29,60,143,.4)' }}
          >
            <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={colors.primary.on} strokeWidth={2.6} strokeLinecap="round">
              <Path d="M12 5v14M5 12h14" />
            </Svg>
          </Pressable>
        </View>
        <Tab label="통계" on={active === 'stats'} onPress={() => router.navigate('/stats')} Glyph={StatsGlyph} />
      </View>
    </>
  );
}
