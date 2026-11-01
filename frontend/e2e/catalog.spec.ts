import { expect, test } from '@playwright/test'

test.describe('catalogue discovery', () => {
  test('women studio exposes categories, styles and occasions', async ({ page }) => {
    await page.goto('/studio/women')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/womenswear/i)
    await expect(page.getByRole('button', { name: /shalwar kameez/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /traditional/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /wedding/i }).first()).toBeVisible()
  })

  test('filtering by category updates the result count', async ({ page }) => {
    await page.goto('/studio/women?category=saree')
    await expect(page).toHaveURL(/category=saree/)
    await expect(page.getByText(/pieces/i).first()).toBeVisible()
  })

  test('men studio lists traditional sets', async ({ page }) => {
    await page.goto('/studio/men')
    await expect(page.getByRole('button', { name: /sherwani/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /kurta pajama/i }).first()).toBeVisible()
  })

  test('accessories page groups footwear and accessories', async ({ page }) => {
    await page.goto('/studio/accessories')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('button', { name: /sneakers/i }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /handbags/i }).first()).toBeVisible()
  })

  test('saved pieces requires authentication', async ({ page }) => {
    await page.goto('/favorites')
    await expect(page).toHaveURL(/\/login/)
  })
})
