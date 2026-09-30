import { db, client } from './db'
import { inquiries } from './drizzle/schema'

// 저장된 문의 목록 확인용
const allInquiries = await db.select().from(inquiries)
console.log(allInquiries)

await client.end()
