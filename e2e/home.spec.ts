import { test, expect } from '@playwright/test'

test('首頁可以正常開啟', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('#root')).toBeAttached()

  await expect(page).toHaveTitle(
    /智の旅行|Jimmy's Travel App/,
  )
})