// 이 자리 정산 — QR을 찍은 사람이 보는 일회성 웹 화면.
// 앱 설치도 로그인도 요구하지 않는다. 접근 권한은 주소의 토큰 하나뿐이고,
// 서버는 이 정산 하나만 돌려준다(여행 장부·다른 지출·다른 사람 계좌는 보이지 않는다).
(function () {
  var FN = 'https://ehitzebmznbhhvuwjxcq.supabase.co/functions/v1/spot';
  var TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

  var token = location.pathname.split('/')[2] || '';
  var $ = function (id) { return document.getElementById(id); };
  var state = $('state');

  function fail(msg) {
    state.textContent = msg;
    state.className = 'state error';
    state.hidden = false;
    $('body').hidden = true;
    $('main').setAttribute('aria-busy', 'false');
  }

  if (!TOKEN_RE.test(token)) return fail('이 정산은 끝났거나 주소가 올바르지 않아요.');
  $('addr').textContent = location.host + '/s/' + token.slice(0, 4);

  // 참여하면 받은 id를 이 기기에만 둔다. 서버로 다시 보낼 때 '나'를 가리키는 값이다.
  var KEY = 'spot:' + token;
  var me = null;
  try { me = localStorage.getItem(KEY); } catch (e) { me = null; }

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }

  function won(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }

  function el(tag, text, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  // 외화는 소수점 없는 통화만 쓰는 게 아니므로 기호만 붙이고 자릿수는 그대로 둔다.
  var SYMBOL = { JPY: '¥', USD: '$', EUR: '€', CNY: '¥', KRW: '' };
  function foreign(amount, currency) {
    if (!currency || currency === 'KRW' || amount == null) return '';
    var sym = SYMBOL[currency] || currency + ' ';
    return sym + Number(amount).toLocaleString('ko-KR');
  }

  function send(method, body) {
    var url = FN + (method === 'GET' ? '?t=' + encodeURIComponent(token) + (me ? '&p=' + encodeURIComponent(me) : '') : '');
    return fetch(url, {
      method: method,
      headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        if (!res.ok) throw new Error((json && json.error && json.error.code) || 'SERVER_ERROR');
        return json;
      });
    });
  }

  var busy = false;
  function act(fn) {
    if (busy) return;
    busy = true;
    $('cta').disabled = true;
    fn().then(load, function (e) {
      busy = false;
      $('cta').disabled = false;
      toast(e.message === 'SPOT_FULL' ? '참여 인원이 가득 찼어요' : '잠시 후 다시 시도해 주세요');
    });
  }

  function render(d) {
    busy = false;
    state.hidden = true;
    $('body').hidden = false;
    $('main').setAttribute('aria-busy', 'false');

    var payer = d.payer_name || '결제자';
    var merchants = (d.merchants || []).filter(Boolean);
    $('merchant').textContent = merchants.join(' · ') || '지출';
    $('when').textContent = [d.paid_local_date, d.schedule_time, d.schedule_title].filter(Boolean).join(' · ');

    var fx = foreign(d.amount_original, d.currency);
    var total = $('total');
    total.textContent = '';
    if (fx) {
      total.appendChild(el('span', fx));
      total.appendChild(el('span', won(d.total_krw), 'krw'));
    } else {
      total.textContent = won(d.total_krw);
    }

    // 이니셜은 참여자가 직접 적은 이름에서 온 값이다 — 문자열로 조립하지 않고 노드로 넣는다.
    var people = $('people');
    people.textContent = '';
    var stack = el('span', '', 'avatars');
    (d.initials || []).slice(0, 4).forEach(function (i) { stack.appendChild(el('i', String(i))); });
    people.appendChild(stack);
    people.appendChild(document.createTextNode((d.people || 0) + '명'));
    $('share').textContent = d.my_share == null ? '—' : won(d.my_share);

    var step = !me ? 'join' : d.reported || d.confirmed ? 'done' : 'pay';
    $('joinBox').hidden = step !== 'join';
    $('payBox').hidden = step !== 'pay';
    $('doneBox').hidden = step !== 'done';

    var cta = $('cta');
    if (step === 'join') {
      $('title').textContent = (d.host_name || '친구') + '님이 이 자리 정산에 초대했어요';
      $('lead').textContent = '앱을 설치하지 않아도 바로 정산할 수 있어요';
      cta.hidden = false;
      cta.textContent = '참여하기';
      var name = $('name');
      var sync = function () { cta.disabled = !name.value.trim(); };
      name.oninput = sync;
      sync();
      cta.onclick = function () {
        act(function () {
          return send('POST', { action: 'join', t: token, name: name.value.trim() }).then(function (r) {
            me = r.member_id;
            try { localStorage.setItem(KEY, me); } catch (e) { /* 사생활 보호 모드 — 이 화면에서만 쓴다 */ }
          });
        });
      };
    } else if (step === 'pay') {
      $('title').textContent = (d.my_name || '') + '님,\n' + payer + '님에게 보내 주세요';
      $('lead').textContent = '';
      var acc = d.account;
      $('accountFor').textContent = '받는 계좌 · ' + payer;
      $('account').textContent = acc ? acc.bank_name + ' ' + acc.number : '계좌가 아직 등록되지 않았어요';
      $('copy').hidden = !acc;
      $('copy').onclick = function () {
        if (!acc) return;
        var text = acc.bank_name + ' ' + acc.number;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { toast('계좌를 복사했어요'); }, function () { toast('복사하지 못했어요'); });
        } else {
          toast('복사하지 못했어요');
        }
      };
      cta.hidden = false;
      cta.textContent = '송금했어요';
      cta.disabled = false;
      cta.onclick = function () {
        act(function () { return send('POST', { action: 'report', t: token, p: me }); });
      };
    } else {
      var title = $('title');
      title.textContent = '';
      title.appendChild(el('span', '✓', 'check'));
      title.appendChild(document.createTextNode('송금했다고 알렸어요'));
      $('lead').textContent = payer + '님이 입금을 확인하면 정산이 끝나요';
      cta.hidden = true;
    }
  }

  function load() {
    return send('GET').then(render, function (e) {
      if (e.message === 'SPOT_GONE') return fail('이 정산은 끝났어요.');
      fail('지금은 불러올 수 없어요. 잠시 후 다시 열어 주세요.');
    });
  }

  load();
})();
