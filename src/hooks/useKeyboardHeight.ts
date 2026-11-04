import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// 올라온 키보드 높이(내려가 있으면 0). iOS는 will* 이벤트라야 키보드와 같은 프레임에 움직인다.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
