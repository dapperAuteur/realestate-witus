// Build a tour from a spreadsheet (plans/06, surface 1: "CSV to tour
// scaffold", the service-pipeline accelerator for big commercial jobs).
//
// One row per room:  room, photo, floor, links_to, start
// - room      the room's name (required; matched case-insensitively, so a
//             second import updates the rooms the first one made)
// - photo     the 360 photo's filename, picked alongside the CSV
// - floor     the name of a floor plan already on the listing (optional)
// - links_to  rooms this one leads to, separated by semicolons. Doorways work
//             both ways, so each pair needs listing only once.
// - start     yes on the room the tour opens in
//
// Pure: the browser parses and previews before anything is created (plans/06:
// "imports are idempotent and previewable"), and the server runs the same
// checks again. Problems carry a line number and a dictionary code, so the
// admin words them (admin.tour.csv.issues) and they stay translatable.

export type CsvIssueCode =
  | "empty"
  | "header"
  | "tooMany"
  | "noName"
  | "nameLong"
  | "duplicate"
  | "ambiguous"
  | "selfLink"
  | "unknownLink"
  | "unknownLinkGuess"
  | "manyStarts"
  | "unknownFloor"
  | "photoUrl"
  | "needsPhoto"
  | "photoNotPicked";

export interface CsvIssue {
  line: number | null;
  code: CsvIssueCode;
  values: Record<string, string>;
}

export interface CsvRoom {
  line: number;
  name: string;
  photo: string | null;
  floor: string | null;
  linksTo: string[];
  start: boolean;
}

export interface ParsedTourCsv {
  rooms: CsvRoom[];
  issues: CsvIssue[];
}

/** What's already on the listing: rooms a row may update or link to, and floors a row may name. */
export interface TourCsvContext {
  rooms: readonly string[];
  floors: readonly string[];
}

export const CSV_MAX_ROOMS = 300;
/** Plenty for 300 rooms; refuses a wrong file (a photo picked as the CSV) before parsing it. */
export const CSV_MAX_CHARS = 200_000;

export const CSV_TEMPLATE = [
  "room,photo,floor,links_to,start",
  "Entrance hall,hall.jpg,,Kitchen;Living room,yes",
  "Kitchen,kitchen.jpg,,Living room,",
  "Living room,living-room.jpg,,,",
].join("\n");

type Column = "name" | "photo" | "floor" | "linksTo" | "start";

// plans/06 wrote the columns as scene_name, panorama_url_or_filename, floor,
// links_to, start_scene. Those spellings work too.
const HEADERS: Record<string, Column> = {
  room: "name",
  room_name: "name",
  scene: "name",
  scene_name: "name",
  name: "name",
  photo: "photo",
  file: "photo",
  filename: "photo",
  panorama: "photo",
  panorama_url_or_filename: "photo",
  floor: "floor",
  links_to: "linksTo",
  links: "linksTo",
  start: "start",
  start_scene: "start",
};

const YES = new Set(["yes", "y", "true", "1", "x"]);

/** RFC 4180: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF, a BOM. */
export function csvRecords(text: string): { line: number; fields: string[] }[] {
  const src = text.replace(/^﻿/, "");
  const records: { line: number; fields: string[] }[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
    } else if (ch === '"' && field.trim() === "") {
      field = "";
      quoted = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      fields.push(field);
      records.push({ line: recordLine, fields });
      fields = [];
      field = "";
      line++;
      recordLine = line;
    } else {
      field += ch;
    }
  }
  if (field !== "" || fields.length) {
    fields.push(field);
    records.push({ line: recordLine, fields });
  }
  // A blank line (or a row of empty cells, as spreadsheets export) isn't a room.
  return records.filter((r) => r.fields.some((f) => f.trim() !== ""));
}

export const roomKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** Edit distance, for "did you mean". Room names are short. */
function distance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return dp[b.length];
}

function suggest(name: string, known: readonly string[]): string | null {
  let best: { name: string; d: number } | null = null;
  for (const candidate of known) {
    const d = distance(roomKey(name), roomKey(candidate));
    if (d <= Math.max(2, Math.floor(candidate.length / 4)) && (!best || d < best.d)) best = { name: candidate, d };
  }
  return best?.name ?? null;
}

const issue = (line: number | null, code: CsvIssueCode, values: Record<string, string | number> = {}): CsvIssue => ({
  line,
  code,
  values: Object.fromEntries(Object.entries({ line: line ?? "", ...values }).map(([k, v]) => [k, String(v)])),
});

/** Parses and checks a tour CSV against what the listing already has. */
export function parseTourCsv(text: string, context: TourCsvContext): ParsedTourCsv {
  const records = text.length > CSV_MAX_CHARS ? [] : csvRecords(text);
  if (records.length === 0) return { rooms: [], issues: [issue(null, "empty")] };

  const header = records[0];
  const columns = header.fields.map((f) => HEADERS[f.trim().toLowerCase().replace(/[\s-]+/g, "_")] ?? null);
  if (!columns.includes("name")) return { rooms: [], issues: [issue(header.line, "header")] };
  if (records.length - 1 > CSV_MAX_ROOMS) return { rooms: [], issues: [issue(null, "tooMany", { max: CSV_MAX_ROOMS })] };

  const issues: CsvIssue[] = [];
  const rooms: CsvRoom[] = [];
  for (const record of records.slice(1)) {
    const row: CsvRoom = { line: record.line, name: "", photo: null, floor: null, linksTo: [], start: false };
    record.fields.forEach((raw, i) => {
      const value = raw.trim();
      switch (columns[i]) {
        case "name":
          row.name = value.replace(/\s+/g, " ");
          break;
        case "photo":
          row.photo = value || null;
          break;
        case "floor":
          row.floor = value || null;
          break;
        case "linksTo":
          row.linksTo = value
            .split(";")
            .map((v) => v.trim())
            .filter(Boolean);
          break;
        case "start":
          row.start = YES.has(value.toLowerCase());
          break;
      }
    });
    if (!row.name) {
      issues.push(issue(row.line, "noName"));
      continue;
    }
    if (row.name.length > 80) issues.push(issue(row.line, "nameLong"));
    if (row.photo && /^[a-z][a-z0-9+.-]*:\/\//i.test(row.photo)) issues.push(issue(row.line, "photoUrl"));
    rooms.push(row);
  }

  const firstLine = new Map<string, number>();
  for (const room of rooms) {
    const seen = firstLine.get(roomKey(room.name));
    if (seen) issues.push(issue(room.line, "duplicate", { name: room.name, first: seen }));
    else firstLine.set(roomKey(room.name), room.line);
  }

  // Two rooms on the listing with one name: a row can't say which it means.
  const existingCount = new Map<string, number>();
  for (const name of context.rooms) existingCount.set(roomKey(name), (existingCount.get(roomKey(name)) ?? 0) + 1);
  const ambiguous = (name: string) => (existingCount.get(roomKey(name)) ?? 0) > 1;

  const known = [...rooms.map((r) => r.name), ...context.rooms];
  const knownKeys = new Set(known.map(roomKey));
  const floorKeys = new Set(context.floors.map(roomKey));
  for (const room of rooms) {
    if (ambiguous(room.name)) issues.push(issue(room.line, "ambiguous", { name: room.name }));
    if (room.floor && !floorKeys.has(roomKey(room.floor))) issues.push(issue(room.line, "unknownFloor", { floor: room.floor }));
    for (const target of room.linksTo) {
      if (roomKey(target) === roomKey(room.name)) {
        issues.push(issue(room.line, "selfLink", { name: room.name }));
      } else if (!knownKeys.has(roomKey(target))) {
        const guess = suggest(target, known);
        issues.push(issue(room.line, guess ? "unknownLinkGuess" : "unknownLink", { target, guess: guess ?? "" }));
      } else if (ambiguous(target) && !firstLine.has(roomKey(target))) {
        issues.push(issue(room.line, "ambiguous", { name: target }));
      }
    }
  }

  const starts = rooms.filter((r) => r.start);
  if (starts.length > 1) issues.push(issue(starts[1].line, "manyStarts", { lines: starts.map((s) => s.line).join(", ") }));
  return { rooms, issues };
}

export interface ImportPlan {
  create: CsvRoom[];
  update: CsvRoom[];
  /** Picked files the import uploads, once each, in row order. */
  uploads: string[];
  /** Pairs of rooms to connect both ways, once per pair. */
  links: [string, string][];
  start: string | null;
  /** Photo problems: a new room without one, or a named file that wasn't picked. */
  issues: CsvIssue[];
  /** Picked files no row names. Not a problem, just said out loud. */
  unusedFiles: string[];
}

/**
 * What an import would do, before it does it. A room already on the listing
 * keeps its photo unless `replacePhotos` is on AND its file was picked, so
 * running the same file twice changes nothing the second time, and replacing
 * two photos means picking just those two.
 */
export function planImport(
  parsed: ParsedTourCsv,
  context: TourCsvContext,
  fileNames: readonly string[],
  options: { replacePhotos: boolean },
): ImportPlan {
  const existing = new Set(context.rooms.map(roomKey));
  const picked = new Map(fileNames.map((f) => [f.toLowerCase(), f]));
  const issues: CsvIssue[] = [];
  const uploads = new Map<string, string>();
  const create: CsvRoom[] = [];
  const update: CsvRoom[] = [];
  for (const room of parsed.rooms) {
    const isNew = !existing.has(roomKey(room.name));
    (isNew ? create : update).push(room);
    const file = room.photo ? picked.get(room.photo.toLowerCase()) : undefined;
    if (!isNew) {
      if (options.replacePhotos && file) uploads.set(file.toLowerCase(), file);
    } else if (!room.photo) {
      issues.push(issue(room.line, "needsPhoto", { name: room.name }));
    } else if (file) {
      uploads.set(file.toLowerCase(), file);
    } else {
      issues.push(issue(room.line, "photoNotPicked", { photo: room.photo }));
    }
  }

  const named = new Set(parsed.rooms.flatMap((r) => (r.photo ? [r.photo.toLowerCase()] : [])));
  const pairs = new Map<string, [string, string]>();
  for (const room of parsed.rooms) {
    for (const target of room.linksTo) {
      if (roomKey(target) === roomKey(room.name)) continue;
      const [a, b] = [room.name, target].sort((x, y) => roomKey(x).localeCompare(roomKey(y)));
      pairs.set(`${roomKey(a)}|${roomKey(b)}`, [a, b]);
    }
  }
  return {
    create,
    update,
    uploads: [...uploads.values()],
    links: [...pairs.values()],
    start: parsed.rooms.find((r) => r.start)?.name ?? null,
    issues,
    unusedFiles: fileNames.filter((f) => !named.has(f.toLowerCase())),
  };
}

/** Fills an issue's dictionary template: "Line {line}: ..." */
export function formatCsvIssue(item: CsvIssue, templates: Record<CsvIssueCode, string>): string {
  return templates[item.code].replace(/\{(\w+)\}/g, (_, name: string) => item.values[name] ?? "");
}
