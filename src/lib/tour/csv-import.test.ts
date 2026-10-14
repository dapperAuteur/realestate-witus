import { describe, expect, it } from "vitest";
import en from "@/dictionaries/en.json";
import {
  CSV_MAX_ROOMS,
  CSV_TEMPLATE,
  csvRecords,
  formatCsvIssue,
  parseTourCsv,
  planImport,
  type TourCsvContext,
} from "./csv-import";

const EMPTY: TourCsvContext = { rooms: [], floors: [] };
const say = (text: string, context = EMPTY) =>
  parseTourCsv(text, context).issues.map((item) => formatCsvIssue(item, en.admin.tour.csv.issues));

describe("csvRecords", () => {
  it("handles quotes, commas and line breaks inside quotes, CRLF, a BOM, and blank lines", () => {
    const text = '﻿room,photo\r\n"Hall, upstairs","a ""b"".jpg"\r\n\r\n,\r\n"Two\nlines",c.jpg';
    expect(csvRecords(text)).toEqual([
      { line: 1, fields: ["room", "photo"] },
      { line: 2, fields: ["Hall, upstairs", 'a "b".jpg'] },
      { line: 5, fields: ["Two\nlines", "c.jpg"] },
    ]);
  });

  it("counts lines from where each row starts", () => {
    const records = csvRecords('room\n"A\nB"\nC');
    expect(records.map((r) => r.line)).toEqual([1, 2, 4]);
  });
});

describe("parseTourCsv", () => {
  it("reads the template cleanly", () => {
    const parsed = parseTourCsv(CSV_TEMPLATE, EMPTY);
    expect(parsed.issues).toEqual([]);
    expect(parsed.rooms.map((r) => r.name)).toEqual(["Entrance hall", "Kitchen", "Living room"]);
    expect(parsed.rooms[0]).toMatchObject({ line: 2, photo: "hall.jpg", linksTo: ["Kitchen", "Living room"], start: true });
    expect(parsed.rooms[2]).toMatchObject({ floor: null, linksTo: [], start: false });
  });

  it("takes plans/06's column names and any column order", () => {
    const parsed = parseTourCsv("start_scene,links_to,Scene Name,panorama_url_or_filename\nyes,,Lobby,lobby.jpg", EMPTY);
    expect(parsed.issues).toEqual([]);
    expect(parsed.rooms[0]).toMatchObject({ name: "Lobby", photo: "lobby.jpg", start: true });
  });

  it("explains a missing header and an empty file", () => {
    expect(say("Lobby,lobby.jpg")).toEqual([
      "Line 1: the first line must name the columns, starting with room. Download the template to see them.",
    ]);
    expect(say("\n\n")).toEqual(["The file is empty, or too big to be a tour spreadsheet."]);
  });

  it("refuses more rooms than one import takes", () => {
    const rows = Array.from({ length: CSV_MAX_ROOMS + 1 }, (_, i) => `Room ${i},r${i}.jpg`);
    expect(parseTourCsv(["room,photo", ...rows].join("\n"), EMPTY).issues[0].code).toBe("tooMany");
  });

  it("names the line for each problem, in words a person can act on", () => {
    const text = [
      "room,photo,floor,links_to,start",
      ",x.jpg,,,",
      "Kitchen,k.jpg,,Kitchen;Livng room,yes",
      "Living room,l.jpg,Attic,,yes",
      "kitchen,k2.jpg,,,",
      "Porch,https://example.com/p.jpg,,Garage,",
    ].join("\n");
    expect(say(text, { rooms: [], floors: ["Ground floor"] })).toEqual([
      "Line 2 has no room name.",
      "Line 6: photo must be the name of a file you choose here, not a web address.",
      "Line 5: “kitchen” is already on line 3. List each room once.",
      "Line 3: “Kitchen” can't lead to itself.",
      "Line 3: links_to names “Livng room”, and there's no room by that name. Did you mean “Living room”?",
      "Line 4: there's no floor named “Attic”. Add its floor plan under Floor plans first, or leave floor blank.",
      "Line 6: links_to names “Garage”, and there's no room by that name.",
      "Only one room can be the start. Lines 3, 4 all say yes.",
    ]);
  });

  it("links to rooms already in the tour, and matches names and floors loosely", () => {
    const parsed = parseTourCsv("room,floor,links_to\nPatio, ground  FLOOR ,the kitchen", {
      rooms: ["The  Kitchen"],
      floors: ["Ground floor"],
    });
    expect(parsed.issues).toEqual([]);
  });

  it("refuses a name the tour already has twice, since a row can't say which it means", () => {
    expect(say("room,links_to\nPatio,Bedroom", { rooms: ["Bedroom", "bedroom"], floors: [] })).toEqual([
      "Line 2: this tour already has more than one room named “Bedroom”. Rename one in the room editor first.",
    ]);
  });
});

describe("planImport", () => {
  const files = ["hall.jpg", "KITCHEN.JPG", "living-room.jpg", "spare.jpg"];

  it("adds new rooms with their photos, connects each pair once, and lists unused files", () => {
    const parsed = parseTourCsv(`${CSV_TEMPLATE}\n`, EMPTY);
    const plan = planImport(parsed, EMPTY, files, { replacePhotos: false });
    expect(plan.issues).toEqual([]);
    expect(plan.create.map((r) => r.name)).toEqual(["Entrance hall", "Kitchen", "Living room"]);
    expect(plan.uploads).toEqual(["hall.jpg", "KITCHEN.JPG", "living-room.jpg"]);
    expect(plan.links).toEqual([
      ["Entrance hall", "Kitchen"],
      ["Entrance hall", "Living room"],
      ["Kitchen", "Living room"],
    ]);
    expect(plan.start).toBe("Entrance hall");
    expect(plan.unusedFiles).toEqual(["spare.jpg"]);
  });

  it("treats B -> A as the same doorway as A -> B", () => {
    const parsed = parseTourCsv("room,photo,links_to\nA,a.jpg,B\nB,b.jpg,A", EMPTY);
    expect(planImport(parsed, EMPTY, ["a.jpg", "b.jpg"], { replacePhotos: false }).links).toEqual([["A", "B"]]);
  });

  it("is idempotent: a second run over the same rooms uploads nothing and needs no files", () => {
    const context = { rooms: ["Entrance hall", "Kitchen", "Living room"], floors: [] };
    const parsed = parseTourCsv(CSV_TEMPLATE, context);
    const plan = planImport(parsed, context, [], { replacePhotos: false });
    expect(plan.issues).toEqual([]);
    expect(plan.create).toEqual([]);
    expect(plan.update).toHaveLength(3);
    expect(plan.uploads).toEqual([]);
  });

  it("replaces an existing room's photo only when asked and its file was picked", () => {
    const context = { rooms: ["Kitchen", "Hall"], floors: [] };
    const parsed = parseTourCsv("room,photo\nKitchen,kitchen.jpg\nHall,hall.jpg", context);
    const kept = planImport(parsed, context, ["kitchen.jpg"], { replacePhotos: false });
    expect([kept.uploads, kept.unusedFiles]).toEqual([[], []]);
    const plan = planImport(parsed, context, ["kitchen.jpg"], { replacePhotos: true });
    expect(plan.uploads).toEqual(["kitchen.jpg"]);
    expect(plan.issues).toEqual([]);
  });

  it("asks for a photo for every new room", () => {
    const parsed = parseTourCsv("room,photo\nAttic,\nCellar,cellar.jpg", EMPTY);
    const plan = planImport(parsed, EMPTY, [], { replacePhotos: false });
    expect(plan.issues.map((i) => formatCsvIssue(i, en.admin.tour.csv.issues))).toEqual([
      "Line 2: “Attic” is a new room, so it needs a photo.",
      "Line 3: choose cellar.jpg along with the other photos.",
    ]);
  });
});
