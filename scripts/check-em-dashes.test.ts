import { describe, expect, it } from "vitest";
import { scanText } from "./check-em-dashes";

const reasons = (file: string, text: string) => scanText(file, text).map((h) => h.reason);

describe("check-em-dashes", () => {
  it("fails any dash in a dictionary, em or en", () => {
    expect(reasons("src/dictionaries/en.json", `{\n  "a": "Price — on request",\n  "b": "Mon–Sat"\n}`)).toEqual([null, null]);
  });

  it("fails a dash in a string or JSX text", () => {
    expect(reasons("src/x.tsx", "const subject = `Invoice ${code} — ${amount}`;")).toEqual([null]);
    expect(reasons("src/x.tsx", "      <p>Open — closed</p>")).toEqual([null]);
  });

  it("allows comments of every shape", () => {
    expect(
      reasons(
        "src/x.tsx",
        ["// a — b", "/**", " * a — b", " */", "{/* a — b */}", "const x = 1; // a — b"].join("\n"),
      ),
    ).toEqual(["code comment", "block comment", "comment", "trailing comment"]);
  });

  it("allows a regex that matches dashes", () => {
    expect(reasons("src/x.ts", "const DASH = /[—–]/;")).toEqual(["regex literal"]);
  });

  it("does not mistake a URL's // for a comment", () => {
    expect(reasons("src/x.ts", 'const u = "https://example.org"; const t = "a — b";')).toEqual([null]);
    expect(reasons("src/x.ts", 'const u = "https://example.org"; // a — b')).toEqual(["trailing comment"]);
  });
});
