import { Check } from 'iconoir-react-native';
import { Pressable, Text, View } from 'react-native';

import { colors } from '@/theme/tokens';

import { Icon } from './Icon';

type Props = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  bold?: boolean;
  /** '필수'(primary-text) / '선택'(ink-300) 태그. 접근성 이름은 `라벨(태그)`. */
  tag?: '필수' | '선택';
  /** 26px 원형 체크(전체 동의). 기본은 20px 체크 아이콘. */
  round?: boolean;
};

// 체크 켜짐 #36B6FF, 꺼짐 #D0D5DD.
export function Checkbox({ label, checked, onChange, bold, tag, round }: Props) {
  const color = checked ? colors.primary.DEFAULT : colors.line.off;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={tag ? `${label}(${tag})` : label}
      onPress={() => onChange(!checked)}
      className="min-h-11 flex-1 flex-row items-center gap-3"
    >
      {round ? (
        <View style={{ backgroundColor: color }} className="h-[26px] w-[26px] items-center justify-center rounded-full">
          <Icon as={Check} size={16} color="#FFFFFF" />
        </View>
      ) : (
        <Icon as={Check} size={20} color={color} />
      )}
      <Text className={`flex-1 text-ink ${bold ? 'font-bold text-base' : 'text-[15px]'}`}>
        {label}
        {tag && <Text className={`font-semibold ${tag === '필수' ? 'text-primary-text' : 'text-ink-300'}`}> {tag}</Text>}
      </Text>
    </Pressable>
  );
}
