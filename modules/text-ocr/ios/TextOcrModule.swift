import ExpoModulesCore
import Vision

public class TextOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TextOcr")

    // script 인자는 안드로이드(ML Kit)용이다. Vision은 언어를 자동 판별하므로 iOS에서는 쓰지 않는다.
    AsyncFunction("recognize") { (uri: URL, _: String) -> [String] in
      guard let data = try? Data(contentsOf: uri), let cgImage = UIImage(data: data)?.cgImage else {
        throw Exception(name: "OCR_FAILED", description: "이미지를 열 수 없음")
      }
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      // 영수증 품목명·숫자에 사전 보정은 해롭다.
      request.usesLanguageCorrection = false
      // iOS 16+ 는 라틴·CJK를 자동 판별한다. 언어 코드 표기가 revision마다 달라 직접 넘기지 않는다.
      request.automaticallyDetectsLanguage = true
      try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
      return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    }
  }
}
