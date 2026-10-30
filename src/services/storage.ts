import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { toUserError } from '@/lib/errors';
import { uuidV4 } from '@/lib/uuid';

import { supabase } from './supabase';

const LONG_EDGE = 1600;
const BUCKET = 'receipts';

// 긴 변 1600px + JPEG 0.8로 다시 인코딩한다. 재인코딩 결과에는 EXIF·GPS가 남지 않는다(PRD §7.3).
export async function preparePhoto(uri: string): Promise<{ uri: string }> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const ctx = ImageManipulator.manipulate(original);
  if (Math.max(original.width, original.height) > LONG_EDGE) {
    ctx.resize(original.width >= original.height ? { width: LONG_EDGE } : { height: LONG_EDGE });
  }
  const saved = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: saved.uri };
}

// 원본이 올라가는 경로를 막기 위해 업로드 직전에 항상 preparePhoto를 거친다(이미 처리된 사진이면 한 번 더 인코딩된다).
export async function uploadReceipt(roomId: string, expenseId: string, localUri: string): Promise<string> {
  const path = `${roomId}/${expenseId}/${uuidV4()}.jpg`;
  try {
    const { uri } = await preparePhoto(localUri);
    const body = await new File(uri).arrayBuffer();
    const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
  } catch {
    throw toUserError({ message: 'UPLOAD_FAILED' });
  }
  return path;
}

export async function signedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) throw toUserError(error);
  return data.signedUrl;
}

// [합치기]: save_expense는 사진 경로가 {room}/{지출 id}/ 아래여야 하므로 기존 지출 폴더로 복사한다.
export async function copyReceipt(path: string, roomId: string, expenseId: string): Promise<string> {
  const to = `${roomId}/${expenseId}/${uuidV4()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).copy(path, to);
  if (error) throw toUserError({ message: 'UPLOAD_FAILED' });
  return to;
}
