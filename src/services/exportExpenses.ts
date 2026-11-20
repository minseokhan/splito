import { File, Paths } from 'expo-file-system';

import { supabase } from './supabase';

export type ExportFormat = 'xlsx' | 'pdf';

// 서버(export-expenses)가 만든 Excel·PDF를 캐시에 저장하고 파일 URI를 돌려준다.
// functions.invoke는 RN에서 바이너리(Blob)를 다루기 어려워 fetch로 직접 받는다.
export async function exportExpenses(roomId: string, format: ExportFormat): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/export-expenses?room_id=${roomId}&format=${format}`,
    {
      headers: {
        Authorization: `Bearer ${data.session?.access_token ?? ''}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
      },
    },
  );
  if (!res.ok) throw new Error(`EXPORT_${res.status}`);
  const name = decodeURIComponent(res.headers.get('X-Filename') ?? `Splito.${format}`);
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(await res.arrayBuffer()));
  return file.uri;
}
