import { expect, test } from "@playwright/test";
import { gotoDashboardRoute } from "./helpers/dashboardAuth";

for (const provider of ["claude", "codex"]) {
  for (const width of [390, 1440, 3378]) {
    test(`${provider} retry delay stays readable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/api/resilience", (route) =>
        route.fulfill({ json: { providerQuotaOverrides: {} } })
      );
      await page.route("**/api/providers", (route) => route.fulfill({ json: { connections: [] } }));
      await gotoDashboardRoute(page, `/dashboard/providers/${provider}`);
      const title = /retry delay|atraso de nova tentativa/i;
      const heading = page.getByRole("heading", { name: title });
      const card = heading.locator("xpath=ancestor::*[@data-slot='card'][1]");
      const select = card.getByRole("combobox", { name: title });
      await expect(select).toBeEnabled();
      const text = await heading.locator("..").boundingBox();
      const control = await select.boundingBox();
      const surface = await card.boundingBox();
      expect(text).not.toBeNull();
      expect(control).not.toBeNull();
      expect(surface).not.toBeNull();
      expect(text!.width).toBeGreaterThan(width < 640 ? 150 : 300);
      expect(text!.height).toBeLessThan(300);
      expect(control!.x).toBeGreaterThanOrEqual(surface!.x);
      expect(control!.x + control!.width).toBeLessThanOrEqual(surface!.x + surface!.width + 1);
      if (width < 640) expect(control!.y).toBeGreaterThanOrEqual(text!.y + text!.height);
      else expect(control!.x).toBeGreaterThanOrEqual(text!.x + text!.width);
    });
  }
}
