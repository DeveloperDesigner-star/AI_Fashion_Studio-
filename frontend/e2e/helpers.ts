import { expect, type APIRequestContext } from '@playwright/test'

export const PASSWORD = 'AuditPass123'

let sequence = 0

export function uniqueEmail(prefix: string): string {
  sequence += 1
  return `${prefix}-${Date.now()}-${sequence}@example.com`
}

export interface Member {
  email: string
  password: string
  fullName: string
  userId: string
  accessToken: string
}

/**
 * Register through the public API. Playwright's `request` fixture shares its
 * cookie jar with the page context, so a page navigation afterwards boots the
 * session from the httpOnly refresh cookie exactly like a returning visitor.
 */
export async function registerMember(
  request: APIRequestContext,
  prefix = 'e2e',
  options: { onboard?: boolean; fullName?: string } = {},
): Promise<Member> {
  const email = uniqueEmail(prefix)
  const fullName = options.fullName ?? 'Audit Member'
  const response = await request.post('/api/v1/auth/register', {
    data: { email, password: PASSWORD, full_name: fullName, accept_terms: true },
  })
  expect(response.status(), await response.text()).toBe(201)
  const body = (await response.json()) as { access_token: string; user: { id: string } }
  const member: Member = {
    email,
    password: PASSWORD,
    fullName,
    userId: body.user.id,
    accessToken: body.access_token,
  }
  if (options.onboard !== false) await onboardMember(request, body.access_token)
  return member
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` }
}

export async function onboardMember(request: APIRequestContext, accessToken: string): Promise<void> {
  const response = await request.post('/api/v1/profile/onboarding', {
    headers: bearer(accessToken),
    data: {
      style_gender: 'womenswear',
      height_cm: 168,
      weight_kg: 58,
      age: 30,
      body_shape: null,
      skin_tone: '#c99a76',
      hair_color: '#241c18',
      hair_style: 'short',
      city: 'Lahore',
      country: 'Pakistan',
      measurements: {
        unit_system: 'metric',
        bust_cm: 88,
        waist_cm: 70,
        hips_cm: 96,
        shoulder_cm: 39,
        inseam_cm: 78,
        sleeve_cm: 58,
        shoe_size_eu: 38,
      },
      create_avatar: true,
    },
  })
  expect([200, 201], await response.text()).toContain(response.status())
}

export function uniqueLabel(prefix: string): string {
  sequence += 1
  return `${prefix} ${Date.now()} ${sequence}`
}
