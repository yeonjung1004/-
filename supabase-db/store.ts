import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'

// 문의 데이터는 AI 폴더의 data/inquiries.json에 저장 (개인정보 포함 — .gitignore 대상)
export const DATA_FILE = join(import.meta.dirname, '..', 'data', 'inquiries.json')

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

async function load(): Promise<Data> {
  try {
    const data = JSON.parse(await readFile(DATA_FILE, 'utf-8')) as Data
    for (const q of data.inquiries) q.memos ??= []
    return data
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { nextInquiryId: 1, nextMemoId: 1, inquiries: [] }
    throw e
  }
}

// 임시 파일에 쓴 뒤 교체 — 저장 도중 꺼져도 기존 파일이 깨지지 않음
async function save(data: Data) {
  await mkdir(dirname(DATA_FILE), { recursive: true })
  const tmp = `${DATA_FILE}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await rename(tmp, DATA_FILE)
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
