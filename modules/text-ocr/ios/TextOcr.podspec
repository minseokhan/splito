Pod::Spec.new do |s|
  s.name           = 'TextOcr'
  s.version        = '1.0.0'
  s.summary        = 'Apple Vision 텍스트 인식'
  s.description    = '기기 내장 OCR로 영수증 글자를 읽는다. 모델 다운로드·과금 없음.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
