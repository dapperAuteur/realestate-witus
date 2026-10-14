// Ported from witus-learn scripts/check-em-dashes.ts (plans/07), trimmed to
// this repo: no citation, standards or FAA exemptions, and dictionaries added.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative } from "node:path";

/**
 * Guards against em and en dashes (— –) creeping back into USER-VISIBLE copy
 * (the ecosystem microcopy rule).
 *
 *   pnpm check:em-dashes          # exit 1 on any unprotected dash
 *   pnpm check:em-dashes --list   # also count the protected hits, by reason
 *
 * What counts as copy here:
 * - src/dictionaries/*.json: every string is copy, so ANY dash there fails.
 * - .ts/.tsx: string literals and JSX text. Code comments are allowed (they're
 *   full of dashes and nobody reads them on a listing page), as are dashes
 *   inside a regex literal, which exist to match dashes.
 * Not checked: plans/, HANDOFF.md, CLAUDE.md, README.md and the migrations'
 * history notes. They are written for people working on the code.
 *
 * Why a script and not an ESLint rule: a dash inside a comment and one inside
 * a string are the same token to ESLint's string rules, and witus-learn found
 * the boundary is about meaning. This keeps the two repos speaking one dialect.
 */

const ROOTS = ["src"];
const EXCLUDE = ["src/db/migrations/"];
const DASH = /[—–]/;

/** Only git-tracked files: the check must not depend on what's lying in a working tree. */
function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z", ...ROOTS], { encoding: "utf-8" });
  return out
    .split("\0")
    .filter((f) => f && (f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".json")))
    // Test names and fixtures are read by developers, like comments. (One test
    // asserts an email has NO dash, so it has to contain one.)
    .filter((f) => !/\.test\.tsx?$/.test(f))
    .filter((f) => !EXCLUDE.some((ex) => f.startsWith(ex)));
}

/** A code comment line. (?!\*) keeps markdown **bold** in a string from looking like one. */
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*(?!\*))/;

/** Why this dash may stay, or null if it is a violation. */
export function reasonFor(line: string, inBlockComment: boolean, isJson: boolean): string | null {
  if (isJson) return null;
  if (inBlockComment) return "block comment";
  if (COMMENT_LINE.test(line)) return "code comment";
  // A line that opens a comment, with the dash after the opener: `{/* … — … */}` in JSX.
  const open = line.indexOf("/*");
  if (open >= 0 && line.search(DASH) > open) return "comment";
  // A dash inside a regex literal: code that matches dashes must keep them.
  for (const m of line.matchAll(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g)) {
    if (DASH.test(m[0])) return "regex literal";
  }
  // A trailing // comment holding the dash, with no dash in the code before it.
  // A // right after a colon is a URL ("https://"), not a comment.
  const slash = line.search(/(?<!:)\/\//);
  if (slash >= 0 && !DASH.test(line.slice(0, slash))) return "trailing comment";
  return null;
}

export interface Hit {
  file: string;
  line: number;
  text: string;
  reason: string | null;
}

export function scanText(file: string, text: string): Hit[] {
  const hits: Hit[] = [];
  const isJson = file.endsWith(".json");
  let inBlockComment = false;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opened = !isJson && line.includes("/*");
    const closed = !isJson && line.includes("*/");
    if (DASH.test(line)) {
      hits.push({ file, line: i + 1, text: line.trim(), reason: reasonFor(line, inBlockComment, isJson) });
    }
    if (opened && !closed) inBlockComment = true;
    if (closed) inBlockComment = false;
  }
  return hits;
}

// Run as a script (not when imported by its test).
if (process.argv[1]?.endsWith("check-em-dashes.ts")) {
  const files = trackedFiles();
  const hits = files.flatMap((file) => scanText(file, readFileSync(file, "utf-8")));
  const violations = hits.filter((h) => h.reason === null);
  if (process.argv.includes("--list")) {
    const byReason = new Map<string, number>();
    for (const h of hits) if (h.reason) byReason.set(h.reason, (byReason.get(h.reason) ?? 0) + 1);
    console.log("Protected (allowed) hits by reason:");
    for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${reason}`);
  }
  console.log(
    `Scanned ${files.length} files: ${hits.length - violations.length} protected, ${violations.length} violation${violations.length === 1 ? "" : "s"}.`,
  );
  if (violations.length > 0) {
    console.error("\nEm or en dashes in user-visible copy (use a comma, a colon, or reword):");
    for (const v of violations) console.error(`  ${relative(process.cwd(), v.file)}:${v.line}\n    ${v.text.slice(0, 150)}`);
    process.exit(1);
  }
}
