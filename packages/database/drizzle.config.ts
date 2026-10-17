import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://trailogue:trailogue_local@localhost:5432/trailogue',
  },
  strict: true,
  verbose: true,
});
