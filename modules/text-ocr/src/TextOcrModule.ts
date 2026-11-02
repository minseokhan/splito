import { NativeModule, requireNativeModule } from 'expo';

export type OcrScript = 'latin' | 'japanese' | 'korean' | 'chinese';

declare class TextOcrModule extends NativeModule<Record<never, never>> {
  // 블록 단위 텍스트. 실패하면 거부한다(모델 다운로드 중·인식 실패·이미지 열기 실패).
  recognize(uri: string, script: OcrScript): Promise<string[]>;
}

export default requireNativeModule<TextOcrModule>('TextOcr');
