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

  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  // '2025-10-20' → '10.20 (월)'. 앱 src/lib/calendar.ts shortDate와 같은 모양.
  function shortDate(iso) {
    var p = iso.split('-').map(Number);
    return p[1] + '.' + p[2] + ' (' + WEEKDAYS[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] + ')';
  }

  // 카테고리 원 색·아이콘(src/theme/tokens.ts cat, src/components/categoryIcon.ts의 iconoir 도형).
  var CAT = {
    food: { bg: '#FFF1E6', icon: '#D25F10', d: ['M6 20H9M12 20H9M9 20V15', 'M17 20V12C17 12 19.5 11 19.5 9C19.5 7.24264 19.5 4.5 19.5 4.5', 'M17 8.5V4.5', 'M4.49999 11C5.49991 13.1281 8.99999 15 8.99999 15C8.99999 15 12.5001 13.1281 13.5 11C14.5795 8.70257 13.5 4.5 13.5 4.5L4.49999 4.5C4.49999 4.5 3.42047 8.70257 4.49999 11Z'] },
    transport: { bg: '#E7F1FF', icon: '#1F6FD1', d: ['M7 16.01L7.01 15.9989', 'M17 16.01L17.01 15.9989', 'M3 12H21V19C21 19.5523 20.5523 20 20 20H4C3.44772 20 3 19.5523 3 19V12Z', 'M21 8V6C21 3.79086 19.2091 2 17 2H7C4.79086 2 3 3.79086 3 6V8', 'M7 8L17 8', 'M4.5 20V21.9C4.5 22.2314 4.76863 22.5 5.1 22.5H7.9C8.23137 22.5 8.5 22.2314 8.5 21.9V20', 'M15.5 20V21.9C15.5 22.2314 15.7686 22.5 16.1 22.5H18.9C19.2314 22.5 19.5 22.2314 19.5 21.9V20'] },
    shopping: { bg: '#FFECF2', icon: '#C2356A', d: ['M9 8H4C2.89543 8 2 8.89543 2 10V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V10C22 8.89543 21.1046 8 20 8H15M9 8V3.6C9 3.26863 9.26863 3 9.6 3H14.4C14.7314 3 15 3.26863 15 3.6V8M9 8H15M9 8V14M15 8V14'] },
    sightseeing: { bg: '#F1ECFF', icon: '#6A45D4', d: ['M2 19V9C2 7.89543 2.89543 7 4 7H4.5C5.12951 7 5.72229 6.70361 6.1 6.2L8.32 3.24C8.43331 3.08892 8.61115 3 8.8 3H15.2C15.3889 3 15.5667 3.08892 15.68 3.24L17.9 6.2C18.2777 6.70361 18.8705 7 19.5 7H20C21.1046 7 22 7.89543 22 9V19C22 20.1046 21.1046 21 20 21H4C2.89543 21 2 20.1046 2 19Z', 'M12 17C14.2091 17 16 15.2091 16 13C16 10.7909 14.2091 9 12 9C9.79086 9 8 10.7909 8 13C8 15.2091 9.79086 17 12 17Z'] },
    lodging: { bg: '#E6F6EF', icon: '#0B7D6C', d: ['M17 21H7C4.79086 21 3 19.2091 3 17V10.7076C3 9.30887 3.73061 8.01175 4.92679 7.28679L9.92679 4.25649C11.2011 3.48421 12.7989 3.48421 14.0732 4.25649L19.0732 7.28679C20.2694 8.01175 21 9.30887 21 10.7076V17C21 19.2091 19.2091 21 17 21Z', 'M9 17H15'] },
    other: { bg: '#EEF1F5', icon: '#5B6475', d: ['M3 17.4V6.6C3 6.26863 3.26863 6 3.6 6H16.6789C16.8795 6 17.0668 6.10026 17.1781 6.26718L20.7781 11.6672C20.9125 11.8687 20.9125 12.1313 20.7781 12.3328L17.1781 17.7328C17.0668 17.8997 16.8795 18 16.6789 18H3.6C3.26863 18 3 17.7314 3 17.4Z'] },
  };

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

    var c = CAT[d.category] || CAT.other;
    $('cat').style.background = c.bg;
    $('cat').style.color = c.icon;
    var svg = $('catIcon');
    svg.textContent = '';
    c.d.forEach(function (path) {
      var n = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      n.setAttribute('d', path);
      svg.appendChild(n);
    });

    // 결제 통화를 크게(파랑), 원화는 옆에 작게. 원화 결제는 원화만 검정으로.
    var fx = foreign(d.amount_original, d.currency);
    $('amtMain').textContent = fx || won(d.total_krw);
    $('amtKrw').textContent = fx ? won(d.total_krw) : '';
    $('amtMain').parentNode.className = fx ? 'amt' : 'amt krw-only';
    var time = d.paid_local_time || (d.schedule_time || '').slice(0, 5);
    $('when').textContent = [d.paid_local_date ? shortDate(d.paid_local_date) : '', time].filter(Boolean).join(' ');
    $('schedTitle').textContent = d.schedule_title || '';
    $('sched').hidden = !d.schedule_title;

    // 품목은 읽기 전용. 1행 품목명 / 결제 통화 금액, 2행 원어명 · 나누는 인원 / 원화.
    var items = d.receipt || [];
    $('itemCount').textContent = '품목 ' + items.length + '개';
    var list = $('items');
    list.textContent = '';
    items.forEach(function (it) {
      var li = document.createElement('li');
      var itFx = foreign(it.amount_original, it.currency);
      li.appendChild(el('span', it.name || '품목', 'nm'));
      li.appendChild(el('span', itFx || (it.krw == null ? '' : won(it.krw)), itFx ? 'am' : 'am krw-only'));
      li.appendChild(el('span', [it.name_original, it.n + '명이 나눠요'].filter(Boolean).join(' · '), 's'));
      li.appendChild(el('span', itFx && it.krw != null ? won(it.krw) : '', 's'));
      list.appendChild(li);
    });

    // 서버가 joined로 판정한다 — 기기에 남은 id가 낡았을 수 있다(정산이 다시 만들어진 경우).
    var joined = !!d.joined;
    if (!joined) me = null;

    // 이니셜은 참여자가 직접 적은 이름에서 온 값이다 — 문자열로 조립하지 않고 노드로 넣는다.
    // 참여 전에는 '나'를 하나 더 그리고, 이름을 적으면 그 첫 글자로 바꾼다.
    var drawPeople = function (mine) {
      var people = $('people');
      people.textContent = '';
      var stack = el('span', '', 'avatars');
      var initials = (d.initials || []).map(String);
      initials = joined ? initials.slice(0, 4) : initials.slice(0, 3).concat(mine || '나');
      initials.forEach(function (i) { stack.appendChild(el('i', i)); });
      people.appendChild(stack);
      people.appendChild(document.createTextNode((d.people || 0) + '명'));
    };
    drawPeople('');

    // 참여 전에는 '내가 들어가면 얼마'(서버 미리보기), 참여 후에는 확정된 내 몫.
    var share = joined ? d.my_share : d.share_preview;
    $('share').textContent = share == null ? '—' : won(share);

    var step = !joined ? 'join' : d.reported || d.confirmed ? 'done' : 'pay';
    $('joinBox').hidden = step !== 'join';
    $('payBox').hidden = step !== 'pay';
    $('doneBox').hidden = step !== 'done';

    var cta = $('cta');
    if (step === 'join') {
      $('title').textContent = (d.host_name || '친구') + '님이 이 자리 정산에\n초대했어요';
      $('lead').textContent = '앱을 설치하지 않아도 바로 정산할 수 있어요';
      cta.hidden = false;
      cta.textContent = '참여하기';
      var name = $('name');
      var sync = function () {
        var v = name.value.trim();
        cta.disabled = !v;
        drawPeople(Array.from(v)[0] || '');
      };
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
      $('title').textContent = payer + '님에게\n보내 주세요';
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
