import * as SecureStore from 'expo-secure-store';

import { isPendingInviteValid, type PendingInvite } from '@/lib/invite';

const KEY = 'pending_invite';

export async function savePendingInvite(token: string): Promise<void> {
  const value: PendingInvite = { token, savedAt: Date.now() };
  await SecureStore.setItemAsync(KEY, JSON.stringify(value));
}

// 만료됐거나 깨진 값이면 지우고 null.
export async function loadPendingInvite(): Promise<PendingInvite | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  let value: PendingInvite | null = null;
  try {
    value = JSON.parse(raw) as PendingInvite;
  } catch {}
  if (value && isPendingInviteValid(value, Date.now())) return value;
  await clearPendingInvite();
  return null;
}

export async function clearPendingInvite(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
