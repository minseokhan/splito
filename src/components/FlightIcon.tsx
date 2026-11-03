import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';

// assets/logo/svg/splito-icon-flight.svg 의 도형을 그대로 옮긴 것이다(이륙하는 비행기).
const FLIGHT_TAKEOFF =
  'M120-120v-80h720v80H120Zm70-200L40-570l96-26 112 94 140-37-207-276 116-31 299 251 170-46q32-9 60.5 7.5T864-585q9 32-7.5 60.5T808-487L190-320Z';

export function FlightIcon({ size = 22, color = colors.primary.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960">
      <Path fill={color} d={FLIGHT_TAKEOFF} />
    </Svg>
  );
}
