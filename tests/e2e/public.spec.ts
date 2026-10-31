import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Read-only journeys over the REAL seeded data via production-identical
// host routing. A11y: serious/critical axe violations fail the gate.
// Tenant-site journeys (listing pages, tours, embeds) join this file with
// the listings workstream — today only the platform tenant is seeded.

const PLATFORM = "http://realestate.witus.online:3199";

async function expectAccessible(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const blocking = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(
    blocking.map((v) => `${v.id}: ${v.nodes.length}x — ${v.help}`),
  ).toEqual([]);
}

test("platform landing renders with the roadmap door", async ({ page }) => {
  await page.goto(`${PLATFORM}/en`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Virtual tours",
  );
  await expect(page.getByRole("link", { name: "See the public roadmap" })).toBeVisible();
  await expectAccessible(page);
});

// Sign-in control rule (witus docs/shared-ui-ux-dx.md): the platform header
// always offers "Sign in" to a signed-out visitor, named exactly that.
test("platform header shows Sign in @smoke", async ({ page }) => {
  await page.goto(`${PLATFORM}/en`);
  const signIn = page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true });
  await expect(signIn).toBeVisible();
  await expect(signIn).toHaveAttribute("href", "/en/sign-in");
});

test("roadmap page lists the build phases",async ({ page }) => {
  await page.goto(`${PLATFORM}/en/roadmap`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Roadmap");
  await expect(page.getByText("Listings and 360 tours").first()).toBeVisible();
  await expectAccessible(page);
});

test("sign-in page offers the magic-link form", async ({ page }) => {
  await page.goto(`${PLATFORM}/en/sign-in`);
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expectAccessible(page);
});

test("unknown pages get a navigable 404", async ({ page }) => {
  await page.goto(`${PLATFORM}/en/nope`);
  await expect(page.getByText("There is no page here")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  await expectAccessible(page);
});
