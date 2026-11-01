import { CheckCircle } from 'iconoir-react-native';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { colors } from '@/theme/tokens';

import { Icon } from './Icon';

const ToastContext = createContext<(message: string) => void>(() => undefined);

// 토스트: 하단 120 위, ink pill, check-circle 민트(#7CF0D8), 14/600, 1.8초 후 사라짐.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    clearTimeout(timer.current);
    setMessage(m);
    timer.current = setTimeout(() => setMessage(null), 1800);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <View pointerEvents="none" className="absolute bottom-[120px] left-0 right-0 items-center">
          <Animated.View
            entering={FadeIn.duration(120)}
            exiting={FadeOut.duration(120)}
            accessibilityLiveRegion="polite"
            className="flex-row items-center gap-2 rounded-full bg-ink px-[18px] py-3"
          >
            <Icon as={CheckCircle} size={18} color={colors.success.icon} />
            <Text className="font-semibold text-sm text-white">{message}</Text>
          </Animated.View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
