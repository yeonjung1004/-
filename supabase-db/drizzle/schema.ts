import { pgTable, serial, varchar, timestamp, integer, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// 문의 폼(루트 index.html)의 name/email/phone/message 필드와 1:1 대응
export const inquiries = pgTable('inquiries', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  // 010-1234-5678 형식, 폼 maxlength="13"과 동일
  phone: varchar('phone', { length: 13 }).notNull(),
  // 폼 maxlength="1000"과 동일
  message: varchar('message', { length: 1000 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 관리자 메모 — 문의 1건에 여러 개
export const inquiryMemos = pgTable('inquiry_memos', {
  id: serial('id').primaryKey(),
  // 문의를 삭제하면 메모도 함께 삭제
  inquiryId: integer('inquiry_id').notNull().references(() => inquiries.id, { onDelete: 'cascade' }),
  // server.ts MEMO_LIMIT, admin.html maxlength="500"과 동일
  content: varchar('content', { length: 500 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // Postgres는 외래키에 인덱스를 자동 생성하지 않음 — 문의별 조회·cascade 삭제용
  index('inquiry_memos_inquiry_id_idx').on(t.inquiryId),
]);

// db.query.inquiries.findMany({ with: { memos: true } })로 함께 조회하기 위한 관계 정의
export const inquiriesRelations = relations(inquiries, ({ many }) => ({
  memos: many(inquiryMemos),
}));

export const inquiryMemosRelations = relations(inquiryMemos, ({ one }) => ({
  inquiry: one(inquiries, { fields: [inquiryMemos.inquiryId], references: [inquiries.id] }),
}));
