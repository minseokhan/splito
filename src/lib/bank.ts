import { z } from 'zod';

// 금융결제원 표준 기관코드. 받을 계좌 등록 화면의 선택지다.
export const BANKS = [
  { code: '004', name: 'KB국민은행' },
  { code: '088', name: '신한은행' },
  { code: '020', name: '우리은행' },
  { code: '081', name: '하나은행' },
  { code: '011', name: 'NH농협은행' },
  { code: '003', name: 'IBK기업은행' },
  { code: '023', name: 'SC제일은행' },
  { code: '027', name: '한국씨티은행' },
  { code: '002', name: 'KDB산업은행' },
  { code: '031', name: 'iM뱅크' },
  { code: '032', name: '부산은행' },
  { code: '039', name: '경남은행' },
  { code: '034', name: '광주은행' },
  { code: '037', name: '전북은행' },
  { code: '035', name: '제주은행' },
  { code: '007', name: '수협은행' },
  { code: '045', name: '새마을금고' },
  { code: '048', name: '신협' },
  { code: '071', name: '우체국' },
  { code: '090', name: '카카오뱅크' },
  { code: '092', name: '토스뱅크' },
  { code: '089', name: '케이뱅크' },
  { code: '238', name: '미래에셋증권' },
  { code: '240', name: '삼성증권' },
  { code: '243', name: '한국투자증권' },
  { code: '218', name: 'KB증권' },
  { code: '271', name: '토스증권' },
] as const;

export type Bank = (typeof BANKS)[number];

// 서버 set_payout_account와 같은 규칙: 숫자·하이픈만, 숫자 8~20자리.
export const accountNumberSchema = z
  .string()
  .trim()
  .regex(/^[0-9-]+$/)
  .refine((s) => {
    const n = s.replace(/-/g, '').length;
    return n >= 8 && n <= 20;
  });
