import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { db } from './db'
import { inquiries } from './drizzle/schema'

const PORT = Number(process.env.PORT ?? 5500)
// 문의 폼 파일이 있는 상위 폴더
const FORM_DIR = join(import.meta.dirname, '..')

// 폼 파일만 서빙 — 상위 폴더의 다른 개인 파일은 노출하지 않음
const STATIC_FILES: Record<string, [string, string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/script.js': ['script.js', 'text/javascript; charset=utf-8'],
}

// 클라이언트(script.js)의 검증 규칙과 동일하게 유지
const LIMITS = { name: 100, email: 255, phone: 13, message: 1000 }

type InquiryInput = { name: string; email: string; phone: string; message: string }

function validate(body: unknown): { data?: InquiryInput; errors?: Record<string, string> } {
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

  return Object.keys(errors).length ? { errors } : { data }
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
    const [saved] = await db.insert(inquiries).values(data).returning({ id: inquiries.id })
    console.log(`문의 저장 완료: id=${saved.id}`)
    sendJson(res, 201, { id: saved.id })
  } catch (e) {
    console.error('문의 저장 실패:', e)
    sendJson(res, 500, { error: '문의 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' })
  }
}

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname

  if (path === '/api/inquiries') {
    if (req.method === 'POST') return handleInquiry(req, res)
    res.setHeader('Allow', 'POST')
    return sendJson(res, 405, { error: '허용되지 않은 메서드입니다.' })
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
})

server.listen(PORT, () => {
  console.log(`문의 폼 서버 실행 중: http://localhost:${PORT}`)
})
