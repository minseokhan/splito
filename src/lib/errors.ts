// ARCHITECTURE §8 에러 처리 표. 서버(RPC·Edge Function)와 클라이언트가 같은 코드를 쓴다.
const READ_FAILED = { message: '영수증을 읽지 못했어요', action: '다시 시도(수동) / 직접 입력, 사진 유지' };
const UPLOAD = { message: '사진을 올리지 못했어요', action: '기기에 보관하고 다시 시도' };
const LEAVE_BLOCKED = { message: '정산을 마친 뒤 나갈 수 있어요', action: '정산 화면' };

const MESSAGES = {
  VERSION_CONFLICT: {
    message: '다른 분이 먼저 수정했어요. 최신 내용을 불러왔어요',
    action: '최신값과 내 수정값을 비교해 다시 적용한다',
  },
  NOT_A_RECEIPT: { message: '영수증을 찾지 못했어요', action: '다시 찍기 / 직접 입력' },
  PARSE_TIMEOUT: READ_FAILED,
  PARSE_FAILED: READ_FAILED,
  PARSE_INVALID: READ_FAILED,
  AI_QUOTA_EXCEEDED: { message: '오늘 자동 인식을 다 썼어요', action: '직접 입력' },
  UPLOAD_FAILED: UPLOAD,
  UPLOAD_INVALID: UPLOAD,
  FX_PENDING: {
    message: '환율을 아직 가져오지 못했어요. 나중에 다시 확정할게요',
    action: '대기 배지 / 수동 입력',
  },
  FX_UNSUPPORTED: { message: '이 통화는 자동 환율이 없어요', action: '방 수동 환율 입력' },
  DATE_IN_FUTURE: { message: '결제일이 미래로 되어 있어요', action: '날짜 수정' },
  AMOUNT_INVALID: { message: '금액을 확인해 주세요', action: '수정' },
  SCOPE_EMPTY: { message: '나눌 사람을 1명 이상 골라주세요', action: '선택' },
  MEMBER_LEFT: { message: '방을 나간 멤버예요', action: '목록 새로고침' },
  INVITE_INVALID: { message: '사용할 수 없는 초대예요. 새 링크를 요청하세요', action: '링크 붙여넣기' },
  BALANCE_NOT_ZERO: LEAVE_BLOCKED,
  FX_PENDING_EXISTS: LEAVE_BLOCKED,
  POOL_OWNER: LEAVE_BLOCKED,
  ACCOUNT_HAS_BALANCE: { message: '정산 중인 여행이 있어요', action: '방 목록' },
  ROOM_DELETED: { message: '삭제된 여행이에요', action: '목록으로 이동' },
  AUTH_EXPIRED: { message: '다시 로그인해 주세요', action: '작성 중 내용 유지 → 로그인 → 원래 화면' },
  LOGIN_CANCELLED: { message: '로그인이 취소됐어요', action: '다시 시도' },
  STT_UNAVAILABLE: { message: '음성 인식을 쓸 수 없어요', action: '직접 입력' },
  PERMISSION_DENIED: { message: '설정에서 권한을 켜주세요', action: 'OS 설정' },
  OFFLINE: { message: '인터넷 연결이 필요해요', action: '입력 보관' },
  RATE_LIMITED: { message: '잠시 후 다시 시도해 주세요' },
  GUEST_REPRESENTATIVE: {
    message: '대표하는 게스트를 다른 분께 넘긴 뒤 나갈 수 있어요',
    action: '게스트 대표자 변경',
  },
  GUEST_IN_USE: { message: '지출에 포함된 게스트는 삭제할 수 없어요', action: '이름·대표자만 변경' },
  INVALID_INPUT: { message: '입력값을 확인해 주세요', action: '수정' },
  FORBIDDEN: { message: '이 작업을 할 권한이 없어요' },
  CURRENCY_LOCKED: { message: '지출이 있어 기본 통화를 바꿀 수 없어요' },
  INVALID_PAYER: { message: '결제자를 다시 선택해 주세요', action: '선택' },
  ALREADY_CONFIRMED: { message: '이미 받은 분이 확인한 송금이에요', action: '새로고침' },
  POOL_IN_USE: { message: '공금 기록이 있어 끌 수 없어요' },
} as const satisfies Record<string, { message: string; action?: string }>;

export type ErrorCode = keyof typeof MESSAGES;
export const ERROR_CODES = Object.keys(MESSAGES) as readonly ErrorCode[];

export type UserError = { code: ErrorCode | 'UNKNOWN'; message: string; action?: string };

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(MESSAGES, value);
}

function fromCode(code: ErrorCode): UserError {
  return { code, ...MESSAGES[code] };
}

// 원본 에러 메시지는 사용자에게 노출하지 않는다. 표에 있는 코드가 아니면 UNKNOWN.
export function toUserError(err: unknown): UserError {
  if (err instanceof TypeError && err.message === 'Network request failed') return fromCode('OFFLINE');
  if (typeof err === 'object' && err !== null) {
    const e = err as { status?: unknown; message?: unknown; error?: { code?: unknown } };
    if (e.status === 401 || e.message === 'JWT expired') return fromCode('AUTH_EXPIRED');
    if (isErrorCode(e.message)) return fromCode(e.message); // RPC: errcode P0001, message = '<CODE>'
    if (isErrorCode(e.error?.code)) return fromCode(e.error.code); // Edge Function: {error:{code}}
  }
  return { code: 'UNKNOWN', message: '잠시 후 다시 시도해 주세요' };
}
