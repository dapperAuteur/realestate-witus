// pnpm seed:demo — first-time BAM Hotel demo setup. Thin wrapper: the shared
// implementation lives in src/lib/demo/ (also used by the nightly reset
// cron). Idempotent: existing content is left alone (the cron owns
// wipe-and-reseed); demo accounts are (re)asserted when DEMO_* env exists.

import { setupDemo } from "../src/lib/demo/accounts";
import { hasDemoLogin } from "../src/lib/env";

setupDemo().then(
  (result) => {
    if (!result.ok) {
      console.error("seed failed:", result.error);
      process.exit(1);
    }
    console.log(
      `bam-hotel ready (${result.data.tenantId}); content ${result.data.seeded ? "seeded" : "already present, skipped"}; demo logins ${hasDemoLogin ? "asserted" : "not configured (DEMO_* env unset)"}`,
    );
    process.exit(0);
  },
  (error) => {
    console.error("seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
