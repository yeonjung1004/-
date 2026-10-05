// Supabase용 저장소 (아직 사용하지 않음) — DB 비밀번호를 고치고 마이그레이션한 뒤 server.ts에서 './store' 대신 import
import { and, asc, desc, eq } from 'drizzle-orm'
import { db } from './db'
import { inquiries, inquiryMemos } from './drizzle/schema'

// 문의·메모는 Supabase Postgres의 inquiries / inquiry_memos 테이블에 저장
export type Memo = { id: number; content: string; createdAt: Date }
export type Inquiry = typeof inquiries.$inferSelect & { memos: Memo[] }
export type InquiryInput = Pick<Inquiry, 'name' | 'email' | 'phone' | 'message'>

// 메모는 작성 순으로, inquiryId 없이
const MEMOS = {
  columns: { id: true as const, content: true as const, createdAt: true as const },
  orderBy: [asc(inquiryMemos.createdAt), asc(inquiryMemos.id)],
}

// 최신 문의 순
export function listInquiries(): Promise<Inquiry[]> {
  return db.query.inquiries.findMany({
    orderBy: [desc(inquiries.createdAt), desc(inquiries.id)],
    with: { memos: MEMOS },
  })
}

export async function createInquiry(input: InquiryInput): Promise<Inquiry> {
  const [saved] = await db.insert(inquiries).values(input).returning()
  return { ...saved, memos: [] }
}

// 없는 id면 undefined. 관리자 페이지가 응답으로 목록 항목을 교체하므로 메모도 함께 반환
export async function updateInquiry(id: number, input: InquiryInput): Promise<Inquiry | undefined> {
  const [updated] = await db.update(inquiries).set(input).where(eq(inquiries.id, id)).returning({ id: inquiries.id })
  if (!updated) return undefined
  return db.query.inquiries.findFirst({ where: eq(inquiries.id, id), with: { memos: MEMOS } })
}

// 메모는 외래키 ON DELETE CASCADE로 함께 삭제됨
export async function deleteInquiry(id: number) {
  const [deleted] = await db.delete(inquiries).where(eq(inquiries.id, id)).returning({ id: inquiries.id })
  return deleted?.id
}

export async function addMemo(inquiryId: number, content: string): Promise<Memo | undefined> {
  // 없는 문의에 대한 INSERT는 외래키 오류가 나므로 먼저 확인
  const [exists] = await db.select({ id: inquiries.id }).from(inquiries).where(eq(inquiries.id, inquiryId))
  if (!exists) return undefined
  const [memo] = await db
    .insert(inquiryMemos)
    .values({ inquiryId, content })
    .returning({ id: inquiryMemos.id, content: inquiryMemos.content, createdAt: inquiryMemos.createdAt })
  return memo
}

export async function deleteMemo(inquiryId: number, memoId: number) {
  const [deleted] = await db
    .delete(inquiryMemos)
    .where(and(eq(inquiryMemos.id, memoId), eq(inquiryMemos.inquiryId, inquiryId)))
    .returning({ id: inquiryMemos.id })
  return deleted?.id
}
