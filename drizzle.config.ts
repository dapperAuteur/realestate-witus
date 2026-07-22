import { readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not load .env files the way Next.js does — it only sees the
// shell environment. Load .env then .env.local here (never overriding vars the
// shell already set) so `pnpm db:migrate` works with Next-style env files.
for (const file of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let value = m[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // file absent — fine
  }
}

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Neon marketplace vars carry the STORAGE_ prefix (BAM's Vercel setup);
    // plain DATABASE_URL is the local/manual fallback. Matches src/lib/env.ts.
    url: process.env.STORAGE_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
