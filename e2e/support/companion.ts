import { expect, type Page } from '@playwright/test';

// Call only for an unconfirmed first entry. This deliberately asserts and uses
// the visible UI; it does not seed identity or silently dismiss unrelated sheets.
export async function skipCompanionIntroduction(page: Page): Promise<void> {
  const introduction = page.getByRole('dialog', {
    name: '你是這趟旅程中的哪位旅伴？', exact: true,
  });
  // Respect the existing test/action deadline for cold module loading instead
  // of introducing a separate shorter startup budget.
  await introduction.waitFor({ state: 'visible' });
  await introduction.getByRole('button', { name: '先看看', exact: true }).click();
  await expect(introduction).toHaveCount(0);
}
