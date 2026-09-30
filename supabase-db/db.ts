import { config } from 'dotenv'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// 실행 위치와 상관없이 이 폴더의 .env를 읽음
config({ path: join(import.meta.dirname, '.env'), quiet: true })

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('.env에 DATABASE_URL이 없습니다.')

// 트랜잭션 모드 풀러는 prepared statement를 지원하지 않으므로 끔
export const client = postgres(connectionString, { prepare: false })
export const db = drizzle(client)
