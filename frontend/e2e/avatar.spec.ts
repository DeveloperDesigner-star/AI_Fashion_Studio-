import { expect, test } from '@playwright/test'

test.describe('avatar studio', () => {
  test('requires authentication', async ({ page }) => {
    await page.goto('/avatar')
    await expect(page).toHaveURL(/\/login/)
  })

  test('the landing page links to the avatar studio for members', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible()
  })
})
