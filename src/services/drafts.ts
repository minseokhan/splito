import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import type { ExpenseDraft } from '@/lib/expenseForm';

// 작성 중 지출은 기기에만 둔다(ADR-010). 방마다 1건.
export type StoredDraft = { draft: ExpenseDraft; localPhotos: string[] };

const key = (roomId: string) => `draft:${roomId}`;
const photoDir = (roomId: string) => new Directory(Paths.document, 'drafts', roomId);

// 캐시 폴더의 사진은 OS가 지울 수 있으므로 documentDirectory로 복사하고 새 uri를 돌려준다.
export async function keepPhoto(roomId: string, uri: string): Promise<string> {
  const dir = photoDir(roomId);
  dir.create({ intermediates: true, idempotent: true });
  const src = new File(uri);
  const dest = new File(dir, src.name);
  if (!dest.exists) await src.copy(dest);
  return dest.uri;
}

export async function loadDraft(roomId: string): Promise<StoredDraft | null> {
  const raw = await AsyncStorage.getItem(key(roomId));
  return raw ? (JSON.parse(raw) as StoredDraft) : null;
}

export async function saveDraft(roomId: string, stored: StoredDraft): Promise<void> {
  await AsyncStorage.setItem(key(roomId), JSON.stringify(stored));
}

export async function clearDraft(roomId: string): Promise<void> {
  await AsyncStorage.removeItem(key(roomId));
  const dir = photoDir(roomId);
  if (dir.exists) dir.delete();
}
