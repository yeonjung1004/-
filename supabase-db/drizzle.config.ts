import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // 마이그레이션은 세션 모드 풀러(5432)로 실행 — 트랜잭션 모드는 DDL에 적합하지 않음
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
})
