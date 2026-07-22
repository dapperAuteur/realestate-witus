import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATE_KEY,
  normalizeTemplate,
  TEMPLATES,
  templateFor,
} from "./templates";

describe("template registry", () => {
  it("ships the decided catalog: classic, editorial, warm", () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(["classic", "editorial", "warm"]);
    expect(DEFAULT_TEMPLATE_KEY).toBe("classic"); // existing tenants unchanged
  });

  it("normalizes unknown keys to null; templateFor falls back to classic", () => {
    expect(normalizeTemplate("editorial")).toBe("editorial");
    expect(normalizeTemplate("brutalist")).toBeNull();
    expect(templateFor(undefined).key).toBe("classic");
    expect(templateFor("brutalist").key).toBe("classic");
  });

  it("flagship structure: editorial is fullbleed + editorial rooms + bands", () => {
    expect(TEMPLATES.editorial).toMatchObject({
      hero: "fullbleed",
      rooms: "editorial",
      bands: true,
    });
    expect(TEMPLATES.classic).toMatchObject({ hero: "boxed", rooms: "cards", bands: false });
  });
});
