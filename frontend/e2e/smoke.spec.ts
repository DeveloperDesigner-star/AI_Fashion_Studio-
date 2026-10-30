import { expect, test } from '@playwright/test'

test.describe('public shell', () => {
  test('landing page renders the studio proposition', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: /womenswear/i }).first()).toBeVisible()
  })

  test('unknown routes show the archive 404', async ({ page }) => {
    await page.goto('/this-route-does-not-exist')
    await expect(page.getByText('404')).toBeVisible()
    await expect(page.getByRole('link', { name: /browse womenswear/i })).toBeVisible()
  })

  test('login validates before contacting the API', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /sign in/i }).first().click()
    await expect(page.getByText(/required/i).first()).toBeVisible()
  })
})

test('studio hub exposes every entry point', async ({ page }) => {
  await page.goto('/studio')
  const nav = page.getByRole('main').or(page.locator('body'))
  for (const label of [
    'Womenswear',
    'Menswear',
    'Shoes & accessories',
    'Design studio',
    'Virtual fitting room',
    'AI stylist',
  ]) {
    await expect(nav.getByText(label, { exact: true }).first()).toBeVisible()
  }
})
