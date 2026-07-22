// Postgres error inspection. Drivers wrap the original error a few `cause`
// levels deep, so unwrap until a SQLSTATE turns up. Callers compare against
// the constants below rather than raw strings.

/** SQLSTATE for a unique-constraint violation. */
export const UNIQUE_VIOLATION = "23505";

/** Walks the cause chain for a Postgres SQLSTATE code. */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
