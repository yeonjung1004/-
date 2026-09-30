import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";

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
