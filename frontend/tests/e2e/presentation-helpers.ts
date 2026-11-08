import type { Page, Locator } from "@playwright/test";

export async function openGraphTools(page: Page) {
  const trigger = page.getByRole("button", {
    name: "Graph tools",
    exact: true,
  });
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
}

export async function openDisclosure(container: Page | Locator, title: string) {
  const summary = container
    .locator("summary")
    .filter({ hasText: title })
    .first();
  if (!(await summary.evaluate((element) => element.closest("details")?.open)))
    await summary.click();
}
