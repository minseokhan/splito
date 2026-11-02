// 기기 내장 OCR(Android ML Kit / iOS Apple Vision). 실패하면 null을 돌려 호출한 쪽이 이미지 경로로 폴백한다.
import TextOcr from '../../modules/text-ocr/src/TextOcrModule';
import { ocrTextFrom, scriptFor } from '@/lib/ocr';

// 사진에서 읽은 글자. 쓸 만한 글자가 안 나오면 null.
export async function recognizeReceipt(localUri: string, baseCurrency: string): Promise<string | null> {
  try {
    return ocrTextFrom(await TextOcr.recognize(localUri, scriptFor(baseCurrency)));
  } catch {
    // 모델 다운로드 중·인식 실패·모듈 미탑재. 전부 폴백으로 본다.
    return null;
  }
}
