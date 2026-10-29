import { ERROR_CODES, isErrorCode, toUserError } from './errors';

const UNKNOWN = { code: 'UNKNOWN', message: '잠시 후 다시 시도해 주세요' };

describe('toUserError — ARCHITECTURE §8 표', () => {
  it.each([
    ['VERSION_CONFLICT', '다른 분이 먼저 수정했어요. 최신 내용을 불러왔어요', '최신값과 내 수정값을 비교해 다시 적용한다'],
    ['NOT_A_RECEIPT', '영수증을 찾지 못했어요', '다시 찍기 / 직접 입력'],
    ['PARSE_TIMEOUT', '영수증을 읽지 못했어요', '다시 시도(수동) / 직접 입력, 사진 유지'],
    ['PARSE_FAILED', '영수증을 읽지 못했어요', '다시 시도(수동) / 직접 입력, 사진 유지'],
    ['PARSE_INVALID', '영수증을 읽지 못했어요', '다시 시도(수동) / 직접 입력, 사진 유지'],
    ['AI_QUOTA_EXCEEDED', '오늘 자동 인식을 다 썼어요', '직접 입력'],
    ['UPLOAD_FAILED', '사진을 올리지 못했어요', '기기에 보관하고 다시 시도'],
    ['UPLOAD_INVALID', '사진을 올리지 못했어요', '기기에 보관하고 다시 시도'],
    ['FX_PENDING', '환율을 아직 가져오지 못했어요. 나중에 다시 확정할게요', '대기 배지 / 수동 입력'],
    ['FX_UNSUPPORTED', '이 통화는 자동 환율이 없어요', '방 수동 환율 입력'],
    ['DATE_IN_FUTURE', '결제일이 미래로 되어 있어요', '날짜 수정'],
    ['AMOUNT_INVALID', '금액을 확인해 주세요', '수정'],
    ['SCOPE_EMPTY', '나눌 사람을 1명 이상 골라주세요', '선택'],
    ['MEMBER_LEFT', '방을 나간 멤버예요', '목록 새로고침'],
    ['INVITE_INVALID', '사용할 수 없는 초대예요. 새 링크를 요청하세요', '링크 붙여넣기'],
    ['BALANCE_NOT_ZERO', '정산을 마친 뒤 나갈 수 있어요', '정산 화면'],
    ['FX_PENDING_EXISTS', '정산을 마친 뒤 나갈 수 있어요', '정산 화면'],
    ['POOL_OWNER', '정산을 마친 뒤 나갈 수 있어요', '정산 화면'],
    ['ACCOUNT_HAS_BALANCE', '정산 중인 여행이 있어요', '방 목록'],
    ['ROOM_DELETED', '삭제된 여행이에요', '목록으로 이동'],
    ['AUTH_EXPIRED', '다시 로그인해 주세요', '작성 중 내용 유지 → 로그인 → 원래 화면'],
    ['LOGIN_CANCELLED', '로그인이 취소됐어요', '다시 시도'],
    ['STT_UNAVAILABLE', '음성 인식을 쓸 수 없어요', '직접 입력'],
    ['PERMISSION_DENIED', '설정에서 권한을 켜주세요', 'OS 설정'],
    ['OFFLINE', '인터넷 연결이 필요해요', '입력 보관'],
    ['RATE_LIMITED', '잠시 후 다시 시도해 주세요', undefined],
    ['GUEST_REPRESENTATIVE', '대표하는 게스트를 다른 분께 넘긴 뒤 나갈 수 있어요', '게스트 대표자 변경'],
    ['GUEST_IN_USE', '지출에 포함된 게스트는 삭제할 수 없어요', '이름·대표자만 변경'],
    ['INVALID_INPUT', '입력값을 확인해 주세요', '수정'],
    ['FORBIDDEN', '이 작업을 할 권한이 없어요', undefined],
    ['CURRENCY_LOCKED', '지출이 있어 기본 통화를 바꿀 수 없어요', undefined],
    ['INVALID_PAYER', '결제자를 다시 선택해 주세요', '선택'],
    ['ALREADY_CONFIRMED', '이미 받은 분이 확인한 송금이에요', '새로고침'],
    ['POOL_IN_USE', '공금 기록이 있어 끌 수 없어요', undefined],
  ])('%s', (code, message, action) => {
    expect(toUserError({ code: 'P0001', message: code })).toEqual(
      action === undefined ? { code, message } : { code, message, action },
    );
  });

  it('표의 코드를 빠짐없이 다룬다', () => {
    expect(ERROR_CODES).toHaveLength(34);
  });
});

describe('toUserError — 입력 형태', () => {
  it('PostgrestError: message가 정확히 코드일 때만 인식한다', () => {
    expect(
      toUserError({ code: 'P0001', message: 'SCOPE_EMPTY', details: null, hint: null }).code,
    ).toBe('SCOPE_EMPTY');
    expect(toUserError({ code: 'P0001', message: 'error: SCOPE_EMPTY at line 3' })).toEqual(UNKNOWN);
  });

  it('SQL 원문을 노출하지 않는다', () => {
    expect(
      toUserError({ code: '23505', message: 'duplicate key value violates unique constraint' }),
    ).toEqual(UNKNOWN);
  });

  it('Edge Function 에러 {error:{code}}', () => {
    expect(toUserError({ error: { code: 'AI_QUOTA_EXCEEDED' } }).code).toBe('AI_QUOTA_EXCEEDED');
    expect(toUserError({ error: { code: 'NOPE' } })).toEqual(UNKNOWN);
  });

  it('HTTP 401 → AUTH_EXPIRED', () => {
    expect(toUserError({ status: 401, message: 'Unauthorized' }).code).toBe('AUTH_EXPIRED');
  });

  it('JWT expired → AUTH_EXPIRED', () => {
    expect(toUserError({ code: 'PGRST303', message: 'JWT expired' }).code).toBe('AUTH_EXPIRED');
  });

  it('네트워크 실패 → OFFLINE', () => {
    expect(toUserError(new TypeError('Network request failed')).code).toBe('OFFLINE');
  });

  it.each([[null], [undefined], ['SCOPE_EMPTY'], ['boom'], [42], [{}], [{ foo: 'bar' }], [new Error('stack')]])(
    '%p → UNKNOWN',
    (input) => {
      expect(toUserError(input)).toEqual(UNKNOWN);
    },
  );
});

describe('isErrorCode', () => {
  it('표의 코드만 참', () => {
    expect(isErrorCode('VERSION_CONFLICT')).toBe(true);
    expect(isErrorCode('UNKNOWN')).toBe(false);
    expect(isErrorCode('toString')).toBe(false);
    expect(isErrorCode(1)).toBe(false);
  });
});
