import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as store from './store'
import { logError, ERROR_LOG } from './logger'
import { alertStatus } from './alert'

const PORT = Number(process.env.PORT ?? 5500)
// 문의 폼 파일이 있는 상위 폴더
const FORM_DIR = join(import.meta.dirname, '..')

// 폼 파일만 서빙 — 상위 폴더의 다른 개인 파일은 노출하지 않음
const STATIC_FILES: Record<string, [string, string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/script.js': ['script.js', 'text/javascript; charset=utf-8'],
  '/analytics.js': ['analytics.js', 'text/javascript; charset=utf-8'],
  // 관리자 페이지 (인증 없음)
  '/admin': ['admin.html', 'text/html; charset=utf-8'],
  '/admin.html': ['admin.html', 'text/html; charset=utf-8'],
  '/admin.css': ['admin.css', 'text/css; charset=utf-8'],
  '/admin.js': ['admin.js', 'text/javascript; charset=utf-8'],
}

// 클라이언트(script.js)의 검증 규칙과 동일하게 유지
const LIMITS = { name: 100, email: 255, phone: 13, message: 1000 }
// admin.html의 메모 maxlength와 동일
const MEMO_LIMIT = 500

function validate(body: unknown): { data?: store.InquiryInput; errors?: Record<string, string> } {
  const src = (body ?? {}) as Record<string, unknown>
  const get = (key: keyof typeof LIMITS) => (typeof src[key] === 'string' ? (src[key] as string).trim() : '')
  const data = { name: get('name'), email: get('email'), phone: get('phone'), message: get('message') }
  const errors: Record<string, string> = {}

  if (!data.name) errors.name = '이름을 입력해주세요.'
  if (!data.email) errors.email = '이메일을 입력해주세요.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = '올바른 이메일 형식이 아닙니다.'
  if (!data.phone) errors.phone = '전화번호를 입력해주세요.'
  else if (!/^0\d{1,2}-\d{3,4}-\d{4}$/.test(data.phone)) errors.phone = '올바른 전화번호 형식이 아닙니다.'
  if (!data.message) errors.message = '문의내용을 입력해주세요.'

  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    if (!errors[key] && data[key].length > LIMITS[key]) errors[key] = `${LIMITS[key]}자 이내로 입력해주세요.`
  }

  return Object.keys(errors).length ? { errors } : { data: { ...data, phone: sanitizePhone(data.phone) } }
}

// 저장 전에 전화번호에서 공백 등 불필요한 문자를 제거해 숫자와 하이픈만 남김
function sanitizePhone(phone: string): string {
  return phone.replace(/[\s\d]/g, '')
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 20_000) throw new Error('요청이 너무 큽니다.')
  }
  return JSON.parse(raw)
}

async function handleInquiry(req: IncomingMessage, res: ServerResponse) {
  let body: unknown
  try {
    body = await readJson(req)
  } catch {
    return sendJson(res, 400, { error: '잘못된 요청입니다.' })
  }

  const { data, errors } = validate(body)
  if (!data) return sendJson(res, 400, { error: '입력값을 확인해주세요.', errors })

  try {
    const saved = (await store.createInquiry(data))!
    console.log(`문의 저장 완료: id=${saved.id}`)
    sendJson(res, 201, { id: saved.id })
  } catch (e) {
    logError('문의 저장 실패', e)
    sendJson(res, 500, { error: '문의 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' })
  }
}

async function listInquiries(res: ServerResponse) {
  try {
    sendJson(res, 200, { inquiries: await store.listInquiries() })
  } catch (e) {
    logError('문의 목록 조회 실패', e)
    // 관리자에게는 데이터 파일 손상 여부를 알려 직접 확인할 수 있게 함
    const message = e instanceof store.DataFileError ? e.message : '문의 목록을 불러오지 못했습니다.'
    sendJson(res, 500, { error: message })
  }
}

async function updateInquiry(req: IncomingMessage, res: ServerResponse, id: number) {
  let body: unknown
  try {
    body = await readJson(req)
  } catch {
    return sendJson(res, 400, { error: '잘못된 요청입니다.' })
  }

  // 수정도 제출과 같은 검증 규칙을 적용
  const { data, errors } = validate(body)
  if (!data) return sendJson(res, 400, { error: '입력값을 확인해주세요.', errors })

  try {
    const updated = await store.updateInquiry(id, data)
    if (!updated) return sendJson(res, 404, { error: '문의를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.' })
    console.log(`문의 수정 완료: id=${id}`)
    sendJson(res, 200, { inquiry: updated })
  } catch (e) {
    logError('문의 수정 실패', e)
    sendJson(res, 500, { error: '문의 수정 중 오류가 발생했습니다.' })
  }
}

async function deleteInquiry(res: ServerResponse, id: number) {
  try {
    const deleted = await store.deleteInquiry(id)
    if (deleted === undefined) return sendJson(res, 404, { error: '문의를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.' })
    console.log(`문의 삭제 완료: id=${id}`)
    sendJson(res, 200, { id })
  } catch (e) {
    logError('문의 삭제 실패', e)
    sendJson(res, 500, { error: '문의 삭제 중 오류가 발생했습니다.' })
  }
}

async function addMemo(req: IncomingMessage, res: ServerResponse, inquiryId: number) {
  let body: unknown
  try {
    body = await readJson(req)
  } catch {
    return sendJson(res, 400, { error: '잘못된 요청입니다.' })
  }

  const raw = (body as Record<string, unknown> | null)?.content
  const content = typeof raw === 'string' ? raw.trim() : ''
  if (!content) return sendJson(res, 400, { error: '메모 내용을 입력해주세요.' })
  if (content.length > MEMO_LIMIT) return sendJson(res, 400, { error: `메모는 ${MEMO_LIMIT}자 이내로 입력해주세요.` })

  try {
    const memo = await store.addMemo(inquiryId, content)
    if (!memo) return sendJson(res, 404, { error: '문의를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.' })
    console.log(`메모 추가 완료: 문의 id=${inquiryId}, 메모 id=${memo.id}`)
    sendJson(res, 201, { memo })
  } catch (e) {
    logError('메모 추가 실패', e)
    sendJson(res, 500, { error: '메모 저장 중 오류가 발생했습니다.' })
  }
}

async function deleteMemo(res: ServerResponse, inquiryId: number, memoId: number) {
  try {
    const deleted = await store.deleteMemo(inquiryId, memoId)
    if (deleted === undefined) return sendJson(res, 404, { error: '메모를 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.' })
    console.log(`메모 삭제 완료: 문의 id=${inquiryId}, 메모 id=${memoId}`)
    sendJson(res, 200, { id: memoId })
  } catch (e) {
    logError('메모 삭제 실패', e)
    sendJson(res, 500, { error: '메모 삭제 중 오류가 발생했습니다.' })
  }
}

function methodNotAllowed(res: ServerResponse, allow: string) {
  res.setHeader('Allow', allow)
  sendJson(res, 405, { error: '허용되지 않은 메서드입니다.' })
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname

  if (path === '/api/inquiries') {
    if (req.method === 'POST') return handleInquiry(req, res)
    if (req.method === 'GET') return listInquiries(res)
    return methodNotAllowed(res, 'GET, POST')
  }

  // /api/inquiries/:id — 관리자 페이지의 수정·삭제
  const match = path.match(/^\/api\/inquiries\/(\d{1,9})$/)
  if (match) {
    const id = Number(match[1])
    if (req.method === 'PUT') return updateInquiry(req, res, id)
    if (req.method === 'DELETE') return deleteInquiry(res, id)
    return methodNotAllowed(res, 'PUT, DELETE')
  }

  // /api/inquiries/:id/memos — 메모 추가, /api/inquiries/:id/memos/:memoId — 메모 삭제
  const memoMatch = path.match(/^\/api\/inquiries\/(\d{1,9})\/memos(?:\/(\d{1,9}))?$/)
  if (memoMatch) {
    const inquiryId = Number(memoMatch[1])
    if (!memoMatch[2]) {
      if (req.method === 'POST') return addMemo(req, res, inquiryId)
      return methodNotAllowed(res, 'POST')
    }
    if (req.method === 'DELETE') return deleteMemo(res, inquiryId, Number(memoMatch[2]))
    return methodNotAllowed(res, 'DELETE')
  }

  const file = STATIC_FILES[path]
  if (req.method !== 'GET' || !file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    return res.end('Not Found')
  }

  try {
    const content = await readFile(join(FORM_DIR, file[0]))
    res.writeHead(200, { 'Content-Type': file[1] })
    res.end(content)
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('파일을 읽을 수 없습니다.')
  }
}

const server = createServer(async (req, res) => {
  try {
    await route(req, res)
  } catch (e) {
    // 각 기능에서 잡지 못한 예상치 못한 오류 — 서버는 계속 실행하고 사용자에게는 안내 문구만 보냄
    logError(`요청 처리 중 예상치 못한 오류 (${req.method} ${req.url})`, e)
    if (res.headersSent) return res.destroy()
    sendJson(res, 500, { error: '예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' })
  }
})

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`포트 ${PORT}을(를) 이미 다른 프로그램이 쓰고 있습니다. 실행 중인 서버를 끄거나 PORT를 바꿔주세요.`)
  } else {
    logError('서버 시작 실패', e)
  }
  process.exit(1)
})

// 어디서도 잡지 못한 오류 — 이 서버는 재시작해 줄 관리 도구 없이 혼자 실행되므로,
// 꺼지지 않고 기록만 남겨 다른 문의 접수는 계속 받도록 함
process.on('unhandledRejection', (e) => logError('처리되지 않은 비동기 오류', e))
process.on('uncaughtException', (e) => logError('처리되지 않은 오류', e))

server.listen(PORT, () => {
  console.log(`문의 폼 서버 실행 중: http://localhost:${PORT}`)
  console.log(`문의 저장 위치: ${store.DATA_FILE}`)
  console.log(`오류 기록 위치: ${ERROR_LOG}`)
  console.log(`오류 알림 메일: ${alertStatus}`)
})
