import { appendFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { sendErrorAlert } from './alert'

// 서버 오류 기록 위치 (AI 폴더의 logs/ — .gitignore 대상, 서버가 외부에 서빙하지 않음)
export const ERROR_LOG = join(import.meta.dirname, '..', 'logs', 'error.log')

// 터미널에 출력하고 파일에도 남김. 요청 본문(개인정보)은 기록하지 않음
export function logError(context: string, error: unknown) {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(`${context}:`, error)
  const line = `[${new Date().toISOString()}] ${context}\n${detail}\n\n`
  // 로그 기록 실패가 또 다른 오류를 일으키지 않도록 무시
  mkdir(dirname(ERROR_LOG), { recursive: true })
    .then(() => appendFile(ERROR_LOG, line, 'utf-8'))
    .catch(() => {})
  sendErrorAlert(context, detail)
}
