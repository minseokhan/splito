// 해커톤: EAS 내부 배포 링크로 교체(manual QA)
var ANDROID_URL = 'https://expo.dev/REPLACE_ANDROID_INTERNAL_URL';
var IOS_URL = 'https://expo.dev/REPLACE_IOS_INTERNAL_URL';

(function () {
  var button = document.getElementById('download');
  var token = location.pathname.split('/')[2] || '';
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return;

  var ua = navigator.userAgent;
  var url = /Android/i.test(ua)
    ? ANDROID_URL
    : /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? IOS_URL
      : null;
  if (!url) return;

  button.hidden = false;
  button.addEventListener('click', function () {
    var go = function () { location.href = url; };
    // 토큰은 클립보드에만 둔다(서버·분석 도구로 보내지 않음)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href).then(go, go);
    } else {
      go();
    }
  });
})();
