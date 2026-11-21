// 여행 패스 구매 전(무료) 화면 조각 — 핸드오프 splito-pass-handoff(code/pass-template.html) 수치를 옮겼다.
// 결제·요청은 아직 서버가 없다. onPay/onRequest를 받아 화면만 닫고, 호출부가 토스트를 띄운다.
import { CheckCircleSolid, Circle, Coins, HelpCircle, InfoCircle, Lock, RefreshDouble } from 'iconoir-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { PASS_PRICE, PASS_REASON, splitShare, type PassReason } from '@/lib/pass';
import { formatKrw } from '@/lib/money';
import { colors } from '@/theme/tokens';

import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';

const CARD = { boxShadow: '0 2px 8px -2px rgba(19,25,39,.06)' };

/** AI 기능 표시용 노란 네 꼭지 별(시안 ✦). */
export function AiStar({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2C12.7 7.3 16.7 11.3 22 12C16.7 12.7 12.7 16.7 12 22C11.3 16.7 7.3 12.7 2 12C7.3 11.3 11.3 7.3 12 2Z" fill={colors.pass.star} />
    </Svg>
  );
}

function SheetFooter({ cta, onCta, close, onClose }: { cta: string; onCta: () => void; close: string; onClose: () => void }) {
  return (
    <View className="gap-2">
      <Pressable accessibilityRole="button" onPress={onCta} className="h-14 items-center justify-center rounded-button bg-primary active:bg-primary-press">
        <Text className="font-semibold text-17 text-white">{cta}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onClose} hitSlop={4} className="h-10 items-center justify-center">
        <Text className="font-semibold text-sm text-ink-400">{close}</Text>
      </Pressable>
    </View>
  );
}

const METHODS = ['토스페이', '카카오페이', '카드'] as const;
export type PayMethod = (typeof METHODS)[number];
const BENEFITS = ['동행 전원 AI 인식 무제한', '내 통계 · 카테고리별 지출 · 예산 추적', 'AI 예산 코칭 · 남은 일정 대비 예산 관리'];

type PassSheetProps = {
  visible: boolean;
  onClose: () => void;
  reason?: PassReason | null;
  owner: boolean;
  memberCount: number;
  // TODO(결제): 토스페이·카카오페이·카드 연동. 지금은 호출부가 안내 토스트만 띄운다.
  onPay: (p: { split: boolean; method: PayMethod }) => void;
  onRequest: () => void;
};

/** 여행 패스 결제 시트. 방장은 결제, 참여자는 방장에게 요청한다. */
export function PassSheet({ visible, onClose, reason, owner, memberCount, onPay, onRequest }: PassSheetProps) {
  const [split, setSplit] = useState(true);
  const [method, setMethod] = useState<PayMethod>('토스페이');
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: 560 }} contentContainerClassName="gap-[18px]">
        <View className="gap-2">
          {!!reason && (
            <Text className="self-start overflow-hidden rounded-badge bg-warning-badge px-2 py-[3px] font-semibold text-xs text-warning-accent">{PASS_REASON[reason]}</Text>
          )}
          <Text className="font-semibold text-22 leading-[31px] text-ink">{'여행 패스로\n이번 여행을 더 편하게'}</Text>
        </View>

        <View className="gap-3.5 overflow-hidden rounded-chip p-5">
          {/* Svg 자체에 absolute를 주면 기본 크기로 그려져 카드가 잘린다. 감싼 View가 카드 크기를 받는다. */}
          <View style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%">
              <Defs>
                {/* 시안: linear-gradient(160deg, #1272BF 0%, #1272BF 55%, #17203A 100%) */}
                <LinearGradient id="pass" x1="0" y1="0" x2="0.35" y2="1">
                  <Stop offset="0" stopColor={colors.primary.text} />
                  <Stop offset="0.55" stopColor={colors.primary.text} />
                  <Stop offset="1" stopColor={colors.ink.DEFAULT} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#pass)" />
            </Svg>
          </View>
          <View className="gap-1">
            <View className="flex-row items-baseline gap-1.5">
              <Text className="font-semibold text-30 text-white">{formatKrw(PASS_PRICE)}</Text>
              <Text className="font-semibold text-base text-sky-200">/ 여행 1회</Text>
            </View>
            <Text className="text-13 text-sky-200">인원 · 기간 상관없이 균일가</Text>
          </View>
          <View className="h-px bg-white/20" />
          {BENEFITS.map((b) => (
            <View key={b} className="flex-row items-center gap-2.5">
              <View className="h-[7px] w-[7px] rounded-full bg-pass-star" />
              <Text className="text-15 text-white">{b}</Text>
            </View>
          ))}
        </View>

        {owner ? (
          <>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: split }}
              onPress={() => setSplit((v) => !v)}
              className={`flex-row items-center gap-3 rounded-card border px-4 py-3.5 ${split ? 'border-primary bg-sky-50' : 'border-line bg-white'}`}
            >
              <Icon as={split ? CheckCircleSolid : Circle} size={22} color={split ? colors.primary.DEFAULT : colors.line.off} />
              <View className="min-w-0 flex-1">
                <Text className="font-semibold text-15 text-ink">동행과 1/N로 나누기</Text>
                <Text className="text-xs text-ink-400">
                  {split ? `지출로 등록돼 정산에 포함 · 1인 ${formatKrw(splitShare(memberCount))}` : '내가 전액 부담해요'}
                </Text>
              </View>
            </Pressable>
            <View className="gap-2">
              <Text className="font-semibold text-13 text-ink-500">결제 수단</Text>
              <View className="flex-row gap-2">
                {METHODS.map((m) => {
                  const on = m === method;
                  return (
                    <Pressable
                      key={m}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => setMethod(m)}
                      className={`h-12 flex-1 items-center justify-center rounded-chip border ${on ? 'border-primary bg-sky-50' : 'border-line bg-white'}`}
                    >
                      <Text className={`font-semibold text-sm ${on ? 'text-primary-text' : 'text-ink'}`}>{m}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        ) : (
          <View className="flex-row items-start gap-2 rounded-chip bg-app px-3.5 py-3">
            <View className="mt-0.5">
              <Icon as={InfoCircle} size={16} color={colors.primary.text} />
            </View>
            <Text className="flex-1 text-13 text-ink">여행 패스는 방장이 대표로 결제해요. 방장에게 요청을 보내면 알림이 가요.</Text>
          </View>
        )}
      </ScrollView>
      <SheetFooter
        cta={owner ? `${formatKrw(PASS_PRICE)} 결제하기` : '방장에게 결제 요청하기'}
        onCta={() => (owner ? onPay({ split, method }) : onRequest())}
        close={owner ? '나중에 할게요' : '닫기'}
        onClose={onClose}
      />
    </BottomSheet>
  );
}

// 'AI 예산 관리가 무엇인가요?' 예시 시트의 조정안 3개(예시 데이터, 카테고리별 하루 금액).
const DEMO_PLANS = [
  { title: '쇼핑 지키기', desc: '쇼핑은 그대로, 식비·관광을 줄여요', keep: '쇼핑', v: ['3.5만', '8천', '4.5만', '1만', '3.5천'] },
  { title: '식비 지키기', desc: '맛집은 그대로, 쇼핑을 줄여요', keep: '식비', v: ['5만', '8천', '3만', '1만', '3.5천'] },
  { title: '골고루 줄이기', desc: '모든 카테고리를 조금씩 줄여요', keep: null, v: ['4.2만', '7천', '3.6만', '1.3만', '3.5천'] },
];
const DEMO_CATS = ['식비', '교통', '쇼핑', '관광', '기타'];

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <View className="gap-2.5">
      <Text className="font-semibold text-13 text-ink-400">
        {n} · {title}
      </Text>
      {children}
    </View>
  );
}

/** 잠금 카드의 'AI 예산 관리가 무엇인가요?' — 예시 데이터로 기능을 보여준다. */
export function BudgetExplainerSheet({
  visible,
  onClose,
  owner,
  onStart,
}: {
  visible: boolean;
  onClose: () => void;
  owner: boolean;
  onStart: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: 520 }} contentContainerClassName="gap-4">
        <View className="gap-1.5">
          <View className="flex-row items-center gap-1.5">
            <AiStar size={15} />
            <Text className="font-semibold text-13 text-primary-text">AI 예산 관리</Text>
          </View>
          <Text className="font-semibold text-22 leading-[31px] text-ink">{'예산만 정하면\n남은 여행을 AI가 같이 챙겨요'}</Text>
        </View>
        <Step n={1} title="지금 얼마나 썼는지 한눈에">
          <View className="gap-2.5 rounded-input bg-app p-4">
            <View className="flex-row justify-between">
              <Text className="text-13 text-ink-400">예산 500,000원 중</Text>
              <Text className="text-13 text-ink-400">남은 281,300원</Text>
            </View>
            <Text className="font-semibold text-22 text-ink">218,700원 썼어요</Text>
            <View className="h-2 rounded-full bg-line">
              <View style={{ width: '44%' }} className="h-full rounded-full bg-primary-text" />
            </View>
          </View>
        </Step>
        <Step n={2} title="오늘 써도 되는 금액">
          <View className="flex-row items-center gap-3 rounded-input bg-app p-4">
            <View className="h-10 w-10 items-center justify-center rounded-chip bg-warning-badge">
              <Icon as={Coins} size={20} color={colors.warning.accent} />
            </View>
            <View className="flex-1">
              <Text className="text-13 text-ink-400">오늘 남은 금액</Text>
              <Text className="font-semibold text-lg text-warning-accent">
                26,000원 <Text className="font-medium text-13 text-ink-300">/ 하루 권장 117,700원</Text>
              </Text>
            </View>
          </View>
        </Step>
        <Step n={3} title="빠르게 쓰고 있으면 조정안 추천">
          <View className="gap-2.5 rounded-card border border-stats-line bg-app p-4">
            <View className="gap-0.5">
              <Text className="font-semibold text-15 text-ink">남은 2일 조정안</Text>
              <Text className="text-xs text-ink-500">하루 101,500원이면 예산 안이에요. 하나를 골라 주세요.</Text>
            </View>
            {DEMO_PLANS.map((p, i) => (
              <View key={p.title} className={`gap-2 rounded-badge border bg-white p-3 ${i === 0 ? 'border-primary-text' : 'border-card-line'}`}>
                <View className="flex-row items-center gap-2">
                  <View
                    className={`h-[18px] w-[18px] items-center justify-center rounded-full border ${i === 0 ? 'border-primary-text' : 'border-line-off'}`}
                  >
                    {i === 0 && <View className="h-2 w-2 rounded-full bg-primary-text" />}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="font-semibold text-sm text-ink">{p.title}</Text>
                    <Text className="text-xs text-ink-400">{p.desc}</Text>
                  </View>
                </View>
                <View className="flex-row gap-[3px]">
                  {DEMO_CATS.map((c, k) => (
                    <View key={c} className={`flex-1 items-center rounded-badge py-[5px] ${c === p.keep ? 'bg-sky-100' : 'bg-app'}`}>
                      <Text className="text-10 text-ink-400">{c}</Text>
                      <Text className={`font-semibold text-xs ${c === p.keep ? 'text-primary-text' : 'text-ink'}`}>{p.v[k]}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
            <Text className="text-11 text-ink-400">금액은 카테고리별 하루 금액이에요</Text>
            <View className="flex-row gap-1.5">
              <View className="h-10 flex-row items-center gap-1 rounded-chip bg-white px-3">
                <Icon as={RefreshDouble} size={15} color={colors.ink.DEFAULT} />
                <Text className="font-semibold text-13 text-ink">다시 분석</Text>
              </View>
              <View className="h-10 flex-1 items-center justify-center rounded-chip bg-primary-text">
                <Text className="font-semibold text-13 text-white">이 안으로 적용</Text>
              </View>
            </View>
          </View>
        </Step>
        <Text className="text-xs text-ink-400">예시 화면이에요. 예산과 통계는 나에게만 보여요.</Text>
      </ScrollView>
      <SheetFooter cta={owner ? '여행 패스로 시작하기' : '방장에게 요청하기'} onCta={onStart} close="닫기" onClose={onClose} />
    </BottomSheet>
  );
}

/** 내 통계 맨 위: 예산 현황 + AI 코칭 자리를 대신하는 잠금 카드(블러 없이 1장). */
export function PassLockCard({ owner, onStart, onExplain }: { owner: boolean; onStart: () => void; onExplain: () => void }) {
  return (
    <View style={CARD} className="items-center gap-3.5 rounded-card bg-white px-5 pb-[18px] pt-6">
      <View className="h-[52px] w-[52px] items-center justify-center rounded-chip bg-sky-100">
        <Icon as={Lock} size={26} color={colors.primary.text} />
      </View>
      <View className="items-center gap-1">
        <View className="flex-row items-center gap-1.5">
          <AiStar />
          <Text className="font-semibold text-19 text-ink">AI 예산 관리</Text>
        </View>
        <Text className="text-center text-sm text-ink-500">예산을 설정하고 내 여행 경비를 효과적으로 관리해요.</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onStart}
        className="h-[52px] self-stretch items-center justify-center rounded-button bg-primary active:bg-primary-press"
      >
        <Text className="font-semibold text-base text-white">{owner ? '여행 패스로 시작하기' : '방장에게 요청하기'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onExplain} className="flex-row items-center gap-1 px-1.5 py-0.5">
        <Icon as={HelpCircle} size={15} color={colors.ink[400]} />
        <Text className="font-semibold text-13 text-ink-400">AI 예산 관리가 무엇인가요?</Text>
      </Pressable>
    </View>
  );
}

/** 내 통계 하단에 떠 있는 남색 잠금 바. */
export function PassLockBar({ count, owner, onPress }: { count: number; owner: boolean; onPress: () => void }) {
  return (
    <View
      style={{ boxShadow: '0 10px 32px -4px rgba(19,25,39,.35)' }}
      className="absolute bottom-7 left-4 right-4 flex-row items-center gap-3 rounded-button bg-ink py-3 pl-4 pr-3"
    >
      <Icon as={Lock} size={20} color={colors.pass.star} />
      <View className="min-w-0 flex-1">
        <Text className="font-semibold text-sm text-white">숨겨진 금액이 {count}개 있어요</Text>
        <Text className="text-xs text-on-dark-sub">여행 패스로 전부 볼 수 있어요</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onPress} hitSlop={4} className="h-[38px] justify-center rounded-chip bg-white px-3.5 active:bg-muted">
        <Text className="font-semibold text-sm text-ink">{owner ? '패스 보기' : '요청하기'}</Text>
      </Pressable>
    </View>
  );
}
