import { NativeModule, registerWebModule } from 'expo';

import type { OcrScript } from './TextOcrModule';

// 웹에는 기기 OCR이 없다. 빈 결과를 돌려 호출한 쪽이 이미지 경로로 폴백하게 한다.
class TextOcrModule extends NativeModule<Record<never, never>> {
  async recognize(_uri: string, _script: OcrScript): Promise<string[]> {
    return [];
  }
}

export default registerWebModule(TextOcrModule, 'TextOcrModule');
