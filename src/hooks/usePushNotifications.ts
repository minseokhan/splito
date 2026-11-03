import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { notificationPath } from '@/lib/push';
import { registerPushToken } from '@/services/push';

// 로그인 후 푸시 토큰을 등록하고, 알림을 누르면 해당 화면으로 보낸다.
// 로그인 전에 누른 알림은 로그인될 때까지 기다렸다 처리된다(userId가 생겨야 effect가 돈다).
export function usePushNotifications(): void {
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const enabled = profile?.push_enabled ?? true;
  const registered = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !enabled || registered.current === userId) return;
    registered.current = userId;
    registerPushToken().catch(() => {
      registered.current = null; // 다음 기회에 다시 시도
    });
  }, [userId, enabled]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const go = (response: Notifications.NotificationResponse) => {
      const path = notificationPath(response.notification.request.content.data);
      if (!cancelled && path) router.push(path as never);
    };
    // 알림을 눌러 앱이 켜진 경우(콜드 스타트)는 리스너가 붙기 전에 이미 끝나 있다.
    Notifications.getLastNotificationResponseAsync().then((r) => r && go(r));
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [userId]);
}
