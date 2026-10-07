import { readFile, writeFile, rename, mkdir, copyFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { logError } from './logger'

// 문의 데이터는 AI 폴더의 data/inquiries.json에 저장 (개인정보 포함 — .gitignore 대상)
export const DATA_FILE = join(import.meta.dirname, '..', 'data', 'inquiries.json')
// 직전 저장본 — 데이터 파일이 깨졌을 때 복구용
const BACKUP_FILE = `${DATA_FILE}.bak`

export type Memo = { id: number; content: string; createdAt: string }
export type Inquiry = {
  id: number
  name: string
  email: string
  phone: string
  message: string
  createdAt: string
  memos: Memo[]
}
export type InquiryInput = Pick<Inquiry, 'name' | 'email' | 'phone' | 'message'>

type Data = { nextInquiryId: number; nextMemoId: number; inquiries: Inquiry[] }

// 깨진 파일을 빈 데이터로 덮어쓰지 않도록, 읽을 수 없으면 반드시 오류로 멈춤
export class DataFileError extends Error {}

function parse(raw: string): Data {
  const data = JSON.parse(raw) as Data
  if (!Number.isInteger(data?.nextInquiryId) || !Number.isInteger(data?.nextMemoId) || !Array.isArray(data?.inquiries)) {
    throw new Error('데이터 파일 형식이 올바르지 않습니다.')
  }
  for (const q of data.inquiries) q.memos ??= []
  return data
}

// 같은 손상에 대해 사본을 한 번만 남기기 위한 표시 (정상 저장되면 초기화)
let corruptCopied = false

async function load(): Promise<Data> {
  let raw: string
  try {
    raw = await readFile(DATA_FILE, 'utf-8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { nextInquiryId: 1, nextMemoId: 1, inquiries: [] }
    throw e
  }

  try {
    return parse(raw)
  } catch (e) {
    logError('데이터 파일 손상 감지', e)
    // 다음 저장 때 덮어써지기 전에 손상된 원본을 따로 보관
    if (!corruptCopied) {
      const copy = DATA_FILE.replace(/\.json$/, `.corrupt-${Date.now()}.json`)
      await copyFile(DATA_FILE, copy).catch((err) => logError('손상된 데이터 파일 보관 실패', err))
      corruptCopied = true
    }
  }

  try {
    const data = parse(await readFile(BACKUP_FILE, 'utf-8'))
    logError('직전 저장본(inquiries.json.bak)으로 복구해 계속 진행', '마지막 저장 1건이 빠졌을 수 있습니다.')
    return data
  } catch {
    throw new DataFileError('데이터 파일이 손상되었고 복구할 저장본도 없습니다. data 폴더를 확인해주세요.')
  }
}

// 임시 파일에 쓴 뒤 교체 — 저장 도중 꺼져도 기존 파일이 깨지지 않음
async function save(data: Data) {
  await mkdir(dirname(DATA_FILE), { recursive: true })
  const tmp = `${DATA_FILE}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  // 교체 전에 현재 파일을 직전 저장본으로 보관 (정상 파일일 때만)
  try {
    parse(await readFile(DATA_FILE, 'utf-8'))
    await copyFile(DATA_FILE, BACKUP_FILE)
  } catch {
    // 첫 저장이거나 현재 파일이 깨진 경우 — 기존 저장본을 유지
  }
  await rename(tmp, DATA_FILE)
  corruptCopied = false
}

// 읽기→수정→쓰기를 한 번에 하나씩 처리해 동시 요청끼리 덮어쓰지 않도록 함
let queue: Promise<unknown> = Promise.resolve()
function transaction<T>(fn: (data: Data) => T | undefined): Promise<T | undefined> {
  const run = queue.then(async () => {
    const data = await load()
    const result = fn(data)
    if (result !== undefined) await save(data)
    return result
  })
  queue = run.catch(() => {})
  return run
}

export async function listInquiries(): Promise<Inquiry[]> {
  const { inquiries } = await load()
  return [...inquiries].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
}

export function createInquiry(input: InquiryInput) {
  return transaction((data) => {
    const inquiry: Inquiry = { id: data.nextInquiryId++, ...input, createdAt: new Date().toISOString(), memos: [] }
    data.inquiries.push(inquiry)
    return inquiry
  })
}

// 없는 id면 undefined
export function updateInquiry(id: number, input: InquiryInput) {
  return transaction((data) => {
    const inquiry = data.inquiries.find((q) => q.id === id)
    if (inquiry) Object.assign(inquiry, input)
    return inquiry
  })
}

export function deleteInquiry(id: number) {
  return transaction((data) => {
    const index = data.inquiries.findIndex((q) => q.id === id)
    if (index === -1) return undefined
    data.inquiries.splice(index, 1)
    return id
  })
}

export function addMemo(inquiryId: number, content: string) {
  return transaction((data) => {
    const inquiry = data.inquiries.find((q) => q.id === inquiryId)
    if (!inquiry) return undefined
    const memo: Memo = { id: data.nextMemoId++, content, createdAt: new Date().toISOString() }
    inquiry.memos.push(memo)
    return memo
  })
}

export function deleteMemo(inquiryId: number, memoId: number) {
  return transaction((data) => {
    const memos = data.inquiries.find((q) => q.id === inquiryId)?.memos
    const index = memos?.findIndex((m) => m.id === memoId) ?? -1
    if (!memos || index === -1) return undefined
    memos.splice(index, 1)
    return memoId
  })
}
