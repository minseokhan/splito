import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// 앱이 떠 있을 때도 배너를 띄운다. 방 화면은 Realtime으로 이미 갱신되지만,
// 다른 방에 있을 때는 알림이 유일한 신호다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 안드로이드는 채널이 없으면 중요도가 '낮음'으로 떨어져 헤드업 배너가 안 뜬다.
// 엣지 함수가 보내는 channelId와 같은 이름이어야 한다.
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: '기본',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

// 로그아웃·알림 끄기 때 지울 토큰. 토큰을 다시 받으려면 권한 흐름을 또 타야 해서 들고 있는다.
let current: string | null = null;

// 권한을 받고 Expo 푸시 토큰을 서버에 올린다. 못 받으면 null(알림 없이 그냥 쓴다).
export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === 'ios' && !Device.isDevice) return null; // iOS 시뮬레이터는 APNs 토큰이 안 나온다
  // 안드로이드 에뮬레이터는 Play 서비스가 있으면 FCM이 동작한다. Device.isDevice로 막으면 QA가 불가능해진다.
  await ensureAndroidChannel();

  const permission = await Notifications.getPermissionsAsync();
  const status = permission.granted ? permission.status : (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== 'string') return null;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await supabase.rpc('set_push_token', {
    p_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  if (error) throw error;
  current = token;
  return token;
}

// 로그아웃·알림 끄기. 토큰을 남겨두면 그 기기로 계속 알림이 간다.
export async function clearPushToken(): Promise<void> {
  if (!current) return;
  const { error } = await supabase.rpc('delete_push_token', { p_token: current });
  current = null;
  if (error) throw error;
}
