package expo.modules.textocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizerOptionsInterface
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class TextOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TextOcr")

    AsyncFunction("recognize") { uri: String, script: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(CodedException("OCR_UNAVAILABLE", "react context 없음", null))
        return@AsyncFunction
      }
      try {
        val input = InputImage.fromFilePath(context, toUri(uri))
        TextRecognition.getClient(optionsFor(script))
          .process(input)
          .addOnSuccessListener { text -> promise.resolve(text.textBlocks.map { it.text }) }
          // 모델 다운로드 중·인식 실패는 전부 여기로 온다. 호출한 쪽이 이미지 폴백으로 돌린다.
          .addOnFailureListener { error -> promise.reject(CodedException("OCR_FAILED", error.message ?: "인식 실패", error)) }
      } catch (error: Exception) {
        promise.reject(CodedException("OCR_FAILED", error.message ?: "인식 실패", error))
      }
    }
  }

  private fun toUri(uri: String): Uri =
    if (uri.startsWith("content://") || uri.startsWith("file://")) Uri.parse(uri) else Uri.fromFile(File(uri))

  private fun optionsFor(script: String): TextRecognizerOptionsInterface = when (script) {
    "japanese" -> JapaneseTextRecognizerOptions.Builder().build()
    "korean" -> KoreanTextRecognizerOptions.Builder().build()
    "chinese" -> ChineseTextRecognizerOptions.Builder().build()
    else -> TextRecognizerOptions.DEFAULT_OPTIONS
  }
}
