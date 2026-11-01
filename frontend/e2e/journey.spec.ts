import { devices, expect, request as apiRequest, test, type Page } from '@playwright/test'
import { bearer, registerMember, uniqueEmail, uniqueLabel } from './helpers'

const PUBLIC_AND_MEMBER_ROUTES = [
  '/',
  '/login',
  '/register',
  '/studio',
  '/studio/women',
  '/studio/men',
  '/studio/accessories',
  '/garment/sculpted-wool-blazer',
  '/marketplace',
  '/dashboard',
  '/designs',
  '/avatar',
  '/favorites',
  '/settings',
  '/onboarding',
  '/fitting-room',
  '/try-on',
  '/outfits',
  '/profile',
  '/assistant',
  '/business',
  '/print',
  '/orders',
  '/notifications',
  '/admin',
  '/this-route-does-not-exist',
]

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('route and responsive audit', () => {
  test('every route renders without runtime errors at desktop width', async ({ page }) => {
    test.setTimeout(180_000)
    await registerMember(page.request, 'routes', { onboard: false })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    for (const route of PUBLIC_AND_MEMBER_ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(650)
      const body = await page.locator('body').innerText()
      expect(body.length, `${route} rendered an empty page`).toBeGreaterThan(80)
      expect(body, `${route} hit a crash boundary`).not.toMatch(/Something went wrong|Internal Server Error/)
      expect(await horizontalOverflow(page), `${route} overflows at 1280px`).toBeLessThanOrEqual(1)
    }
    expect(errors, `runtime errors:\n${errors.join('\n')}`).toEqual([])
  })

  test('every route stays inside a 390px viewport', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await registerMember(page.request, 'mobile-routes', { onboard: false })

    for (const route of PUBLIC_AND_MEMBER_ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)
      expect(await horizontalOverflow(page), `${route} overflows at 390px`).toBeLessThanOrEqual(1)
      await expect(page.locator('body')).toBeVisible()
    }
  })
})

test.describe('member journey', () => {
  test('registration, onboarding, rigged avatar and animations work end to end', async ({ page }) => {
    test.setTimeout(240_000)
    const email = uniqueEmail('journey')
    await page.goto('/register')
    await page.getByLabel('Full name').fill('Journey Member')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password *', { exact: true }).fill('AuditPass123')
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Create account' }).click()

    await page.waitForURL('**/onboarding')
    await expect(page.getByRole('heading', { name: 'Build your fitting profile' })).toBeVisible()

    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByLabel('Bust', { exact: true }).fill('88')
    await page.getByLabel('Waist', { exact: true }).fill('70')
    await page.getByLabel('Hips', { exact: true }).fill('96')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Create my avatar' }).click()

    await page.waitForURL('**/fitting-room', { timeout: 120_000 })
    const region = page.getByRole('region', { name: 'Interactive 3D fitting room' })
    await expect(region).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText('Loading rigged avatar')).toBeHidden({ timeout: 120_000 })
    await expect(page.getByText('3D model unavailable')).toBeHidden()

    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible()
    expect(
      await canvas.evaluate((element) => {
        const target = element as HTMLCanvasElement
        return Boolean(target.getContext('webgl2') || target.getContext('webgl'))
      }),
    ).toBe(true)

    await page.getByRole('button', { name: 'Pause animation' }).click()
    await page.waitForTimeout(400)
    const pausedA = await canvas.screenshot()
    await page.waitForTimeout(400)
    const pausedB = await canvas.screenshot()
    expect(pausedA.equals(pausedB), 'paused canvas should hold still').toBe(true)

    await page.getByRole('button', { name: 'Walk', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Walk', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.waitForTimeout(700)
    const walking = await canvas.screenshot()
    expect(pausedA.equals(walking), 'walk animation should move the rig').toBe(false)

    const speed = page.getByRole('slider', { name: 'Animation speed' })
    await speed.focus()
    await page.keyboard.press('ArrowRight')
    await expect(speed).toHaveValue('1.1')
    await page.getByRole('button', { name: 'Side view' }).click()
    await expect(page.getByRole('button', { name: 'Side view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(1200)
    await expect(page.getByRole('toolbar', { name: '3D fitting room controls' })).toBeVisible()
    await page.getByRole('button', { name: 'Turn', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Turn', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await horizontalOverflow(page), 'fitting room overflows on mobile').toBeLessThanOrEqual(1)
  })

  test('profile saves body data, uploads private media and renders the avatar studio', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const member = await registerMember(page.request, 'profile')
    await page.goto('/profile')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Audit')
    await page.getByLabel('Display name').fill('Audit Member Edited')
    await page.getByLabel('Bust / chest').fill('90')
    await page.getByRole('button', { name: 'Save measurements' }).click()
    await expect(page.getByText('Profile saved')).toBeVisible({ timeout: 20_000 })

    const profile = await page.request.get('/api/v1/profile', { headers: bearer(member.accessToken) })
    expect(profile.ok()).toBeTruthy()
    const profileBody = (await profile.json()) as { display_name: string; measurements: { bust_cm: number } }
    expect(profileBody.display_name).toBe('Audit Member Edited')
    expect(profileBody.measurements.bust_cm).toBe(90)

    await page.locator('input[type="file"]').first().setInputFiles('e2e/fixtures/portrait.png')
    await expect(page.getByText('Photo uploaded')).toBeVisible({ timeout: 30_000 })
    const mediaResponse = await page.request.get('/api/v1/media', { headers: bearer(member.accessToken) })
    expect(mediaResponse.ok()).toBeTruthy()
    const media = (await mediaResponse.json()) as { items: { id: string; kind: string; url: string }[] }
    const photo = media.items.find((item) => item.kind === 'photo')
    expect(photo).toBeTruthy()
    const assetId = photo!.id

    const owner = await page.request.get(`/api/v1/media/${assetId}/content`, {
      headers: bearer(member.accessToken),
    })
    expect(owner.status()).toBe(200)
    expect(owner.headers()['content-type']).toContain('image')

    const baseURL = String(test.info().project.use.baseURL)
    const anonymous = await apiRequest.newContext({ baseURL })
    expect((await anonymous.get(`/api/v1/media/${assetId}/content`)).status()).toBe(401)
    await anonymous.dispose()

    await page.goto('/avatar')
    await expect(page.getByRole('heading', { name: 'Your fitting figure' })).toBeVisible()
    await expect(page.getByText('Live preview')).toBeVisible()
    await expect(page.locator('canvas').first()).toBeVisible()
  })

  test('component design saves, proof exports and a print package is produced', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await registerMember(page.request, 'design')
    const designName = uniqueLabel('Audit blazer')

    await page.goto('/garment/sculpted-wool-blazer')
    await expect(page.getByRole('heading', { name: 'Sculpted Wool Blazer' })).toBeVisible()
    const jacket = page.getByRole('button', { name: /jacket front/i }).first()
    if ((await jacket.getAttribute('aria-expanded')) !== 'true') await jacket.click()
    await expect(page.getByRole('button', { name: /^Set Colour to/ }).first()).toBeVisible()
    await page.getByRole('button', { name: /^Set Colour to/ }).first().click()
    await page.getByLabel('Design name').fill(designName)
    await page.getByRole('button', { name: 'Save design' }).click()
    await expect(page.getByRole('button', { name: 'Update design' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Studio layers →' }).click()

    await page.waitForURL(/\/editor\/[0-9a-f-]+/, { timeout: 60_000 })
    await expect(page.getByLabel('Design name')).toHaveValue(designName)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Back to editing' })).toBeVisible()
    await page.getByRole('button', { name: 'Back to editing' }).click()

    const proofDownload = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByRole('button', { name: 'Export proof' }).click()
    const proof = await proofDownload
    expect(proof.suggestedFilename()).toMatch(/\.png$/)
    await expect(page.getByText('Proof exported')).toBeVisible({ timeout: 30_000 })

    await page.goto('/print')
    await page.getByRole('button', { name: 'New print package' }).click()
    await page.getByLabel('Design').selectOption({ index: 1 })
    await page.getByLabel('Package name').fill('Audit print package')
    await page.getByRole('button', { name: 'Build package' }).click()

    await page.waitForURL(/\/print\/[0-9a-f-]+/, { timeout: 60_000 })
    await expect(page.getByRole('heading', { name: 'Audit print package' })).toBeVisible()
    const pdfDownload = page.waitForEvent('download', { timeout: 60_000 })
    await page.getByRole('button', { name: 'Download PDF' }).click()
    const pdf = await pdfDownload
    expect(pdf.suggestedFilename()).toMatch(/\.pdf$/)
  })

  test('business profile, offline stylist fallback and try-on unavailable state', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await registerMember(page.request, 'business')
    const studioName = uniqueLabel('Audit Atelier')

    await page.goto('/business')
    await expect(page.getByRole('heading', { name: 'Open your studio' })).toBeVisible()
    await page.getByLabel('Studio name').fill(studioName)
    await page.getByLabel('City').fill('Lahore')
    await page.getByLabel('Country').fill('Pakistan')
    await page.getByLabel('Description').fill('Independent audit atelier for made-to-measure tailoring.')
    await page.getByRole('button', { name: 'Create studio profile' }).click()
    await expect(page.getByRole('heading', { name: studioName })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Business dashboard')).toBeVisible()

    await page.goto('/assistant')
    await expect(page.getByText(/No AI model is connected/i)).toBeVisible()
    const assistantResponse = page.waitForResponse(
      (response) => response.url().includes('/ai/assistant') && response.status() === 200,
    )
    await page.getByRole('button', { name: /travel capsule/i }).click()
    await assistantResponse
    await expect(page.getByText('Composing a look…')).toBeHidden({ timeout: 30_000 })
    expect(await page.getByText('Studio stylist').count()).toBeGreaterThanOrEqual(2)
    await expect(page.getByText('Rule-based').first()).toBeVisible()

    await page.goto('/try-on')
    await expect(page.getByRole('heading', { name: 'See the idea before the fitting' })).toBeVisible()
    await expect(page.getByText('No fit guarantee')).toBeVisible()
    await page.getByRole('tab', { name: 'My photo · AI' }).click()
    await expect(page.getByText('No generated preview')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Generate AI preview' })).toBeDisabled()
  })
})

test.describe('mobile 3D', () => {
  test.use({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2.75,
    userAgent: devices['Pixel 5'].userAgent,
  })

  test('rigged animations and responsive controls run on an emulated phone', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await registerMember(page.request, 'mobile-3d')
    const started = Date.now()
    await page.goto('/fitting-room')
    const region = page.getByRole('region', { name: 'Interactive 3D fitting room' })
    await expect(region).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText('Loading rigged avatar')).toBeHidden({ timeout: 120_000 })
    const readyMs = Date.now() - started
    expect(readyMs, `3D became interactive after ${readyMs} ms`).toBeLessThan(90_000)

    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible()
    expect(await horizontalOverflow(page), 'mobile fitting room overflows').toBeLessThanOrEqual(1)

    await page.getByRole('button', { name: 'Pause animation' }).click()
    await page.waitForTimeout(400)
    const paused = await canvas.screenshot()
    await page.getByRole('button', { name: 'Walk', exact: true }).click()
    await page.waitForTimeout(800)
    const walking = await canvas.screenshot()
    expect(paused.equals(walking), 'walk animation did not change the canvas').toBe(false)

    await expect(page.getByRole('toolbar', { name: '3D fitting room controls' })).toBeVisible()
    await page.getByRole('button', { name: 'Back view' }).click()
    await expect(page.getByRole('button', { name: 'Back view' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Full screen' }).click()
    await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeVisible()
    await page.getByRole('button', { name: 'Exit full screen' }).click()
  })
})

test.describe('administration', () => {
  const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin-audit@example.com'
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'AdminPass123'

  test('member cannot open the admin console', async ({ page }) => {
    const member = await registerMember(page.request, 'admin-denied')
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Administrator access required' })).toBeVisible()
    expect(
      (await page.request.get('/api/v1/admin/stats', { headers: bearer(member.accessToken) })).status(),
    ).toBe(403)
  })

  test('administrator can load operational sections', async ({ page }) => {
    test.setTimeout(180_000)
    const login = await page.request.post('/api/v1/auth/login', {
      data: { email: adminEmail, password: adminPassword },
    })
    test.skip(login.status() !== 200, 'Run scripts/create_admin.py to seed the E2E administrator.')

    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Studio operations' })).toBeVisible()
    await expect(page.getByText('Accounts', { exact: true }).first()).toBeVisible()

    for (const tab of ['Users', 'Reports', 'AI providers', 'Catalogue', 'Assets', 'Security', 'Audit trail']) {
      await page.getByRole('tab', { name: tab }).click()
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByText(/could not be loaded|Stats unavailable/i)).toHaveCount(0)
      await page.waitForTimeout(250)
    }
    await expect(page.getByRole('heading', { name: 'Studio operations' })).toBeVisible()
  })
})
