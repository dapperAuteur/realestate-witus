import { customType } from "drizzle-orm/pg-core";

/** Case-insensitive text (Postgres citext). Extension created in migration 0000. */
export const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});
