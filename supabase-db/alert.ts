import { config } from 'dotenv'
import { join } from 'node:path'

// 실행 위치와 상관없이 이 폴더의 .env를 읽음 (RESEND_API_KEY, ERROR_ALERT_EMAIL)
config({ path: join(import.meta.dirname, '.env'), quiet: true })

const API_KEY = process.env.RESEND_API_KEY ?? ''
const TO = process.env.ERROR_ALERT_EMAIL ?? ''
// Resend 테스트용 발신 주소 — 도메인 인증 없이는 Resend 가입 이메일로만 보낼 수 있음
const FROM = process.env.ERROR_ALERT_FROM ?? '문의 폼 서버 <onboarding@resend.dev>'
// 오류가 연달아 나도 메일이 쏟아지지 않도록 이 간격에 한 통만 보냄
const COOLDOWN_MS = 10 * 60 * 1000

// 키가 비었거나 예시 문구 그대로면 알림을 끔
export const alertStatus = !/^re_[A-Za-z0-9_]+$/.test(API_KEY)
  ? '꺼짐 (.env의 RESEND_API_KEY를 실제 키로 넣어주세요)'
  : !TO.includes('@')
    ? '꺼짐 (.env의 ERROR_ALERT_EMAIL을 넣어주세요)'
    : `켜짐 (받는 주소: ${TO})`
const enabled = alertStatus.startsWith('켜짐')

let lastSentAt = 0
let suppressed = 0

// 서버 오류를 이메일로 알림. 실패해도 서버 동작에는 영향 없음
// (logger.ts에서 호출하므로 여기서는 logError를 쓰지 않음 — 무한 반복 방지)
export function sendErrorAlert(context: string, detail: string) {
  if (!enabled) return
  const now = Date.now()
  if (now - lastSentAt < COOLDOWN_MS) {
    suppressed++
    return
  }
  lastSentAt = now
  const skipped = suppressed
  suppressed = 0

  const time = new Date(now).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  const text = [
    `문의 폼 서버에서 예상치 못한 오류가 발생했습니다.`,
    ``,
    `시각: ${time}`,
    `내용: ${context}`,
    skipped ? `직전 알림 이후 메일을 보내지 않은 오류: ${skipped}건` : '',
    ``,
    detail.slice(0, 4000),
    ``,
    `전체 기록은 서버 컴퓨터의 AI/logs/error.log에서 확인할 수 있습니다.`,
    `(오류 메일은 ${COOLDOWN_MS / 60000}분에 최대 1통만 보냅니다.)`,
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n')

  fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [TO], subject: `[문의 폼] 서버 오류: ${context}`.slice(0, 150), text }),
    signal: AbortSignal.timeout(10_000),
  })
    .then(async (res) => {
      if (!res.ok) console.error(`오류 알림 메일 발송 실패 (${res.status}):`, await res.text().catch(() => ''))
    })
    .catch((e) => console.error('오류 알림 메일 발송 실패:', e))
}
