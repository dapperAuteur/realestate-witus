import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Read-only journeys over the REAL seeded data via production-identical
// host routing. A11y: serious/critical axe violations fail the gate.

const PLATFORM = "http://stay.witus.online:3199";
const DEMO = "http://demo.stay.witus.online:3199";

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

test("platform landing renders with demo + roadmap doors", async ({ page }) => {
  await page.goto(`${PLATFORM}/en`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Hotel websites",
  );
  await expect(page.getByRole("link", { name: "Explore the demo hotel" })).toBeVisible();
  await expect(page.getByRole("link", { name: "See the public roadmap" })).toBeVisible();
  await expectAccessible(page);
});

test("demo hotel homepage: Editorial template, ribbon, booking door", async ({ page }) => {
  await page.goto(`${DEMO}/en`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("BAM Hotel");
  // Demo ribbon (signed-out) links to the demo login.
  await expect(page.getByRole("link", { name: "Try the owner dashboard" })).toBeVisible();
  // Persistent Book button in the tenant header.
  await expect(page.getByRole("banner").getByRole("link", { name: "Book" })).toBeVisible();
  // Editorial room rows link through to detail pages.
  await expect(page.getByRole("link", { name: "Rooftop Suite" })).toBeVisible();
  await expectAccessible(page);
});

test("booking search shows priced availability (read-only)", async ({ page }) => {
  await page.goto(`${DEMO}/en/book?checkIn=2036-06-01&checkOut=2036-06-04`);
  await expect(page.getByRole("button", { name: /Reserve this room/ }).first()).toBeVisible();
  await expect(page.getByText("GHS").first()).toBeVisible();
  await expectAccessible(page);
});

test("room detail carries dates back to booking", async ({ page }) => {
  await page.goto(`${DEMO}/en/rooms/garden-queen?checkIn=2036-06-01&checkOut=2036-06-04`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Garden Queen");
  const cta = page.getByRole("link", { name: "Check availability" });
  await expect(cta).toHaveAttribute("href", /checkIn=2036-06-01/);
  await expectAccessible(page);
});

test("events page renders with honest capacity", async ({ page }) => {
  await page.goto(`${DEMO}/en/events`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("What's on");
  await expect(page.getByRole("button", { name: /Reserve/ }).first()).toBeVisible();
  await expectAccessible(page);
});

test("sign-in page offers the demo logins on the demo host", async ({ page }) => {
  await page.goto(`${DEMO}/en/sign-in`);
  await expect(page.getByRole("button", { name: "Try the demo as the owner" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try the demo as front desk" })).toBeVisible();
  await expectAccessible(page);
});

test("unknown pages get a navigable 404", async ({ page }) => {
  await page.goto(`${DEMO}/en/nope`);
  await expect(page.getByText("There is no page here")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  await expectAccessible(page);
});
