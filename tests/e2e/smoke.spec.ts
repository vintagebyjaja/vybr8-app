import { expect, test } from "@playwright/test";

test("home loads with the primary question and navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("vybe");
  await expect(page.getByRole("navigation", { name: "Primary" }).first()).toBeVisible();
});

test("protected areas send signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/vybe");
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fvybe/);
});

test("admin area is not discoverable by signed-out visitors", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
});

test("PWA manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  expect((await res.json()).name).toBe("VYBR8");
});

test("sign-up asks for a birthday and says VYBR8 is 21+", async ({ page }) => {
  await page.goto("/auth/sign-up");
  await expect(page.getByLabel("Birthday")).toBeVisible();
  await expect(page.getByText(/21/).first()).toBeVisible();
});

test("Birthday Perks is public", async ({ page }) => {
  await page.goto("/birthday");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Birthday");
});
