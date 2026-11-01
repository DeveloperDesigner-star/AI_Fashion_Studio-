/**
 * Vercel builds the frontend only. A relative /api/v1 would point at Vercel itself and every
 * request would 404, so fail the build unless the API origin is explicit.
 */
const apiBase = process.env.VITE_API_BASE_URL?.trim()
const problems = []

if (!apiBase) {
  problems.push('VITE_API_BASE_URL is not set. Add it in Vercel → Settings → Environment Variables.')
} else {
  if (!/^https:\/\//.test(apiBase)) {
    problems.push('VITE_API_BASE_URL must be an absolute https:// URL for a Vercel build.')
  }
  if (!apiBase.replace(/\/$/, '').endsWith('/api/v1')) {
    problems.push('VITE_API_BASE_URL must end with /api/v1 (for example https://api.example.com/api/v1).')
  }
}

if (apiBase && /localhost|127\.0\.0\.1/.test(apiBase)) {
  problems.push('VITE_API_BASE_URL points at localhost; a phone cannot reach the sandbox from Vercel.')
}

if (problems.length) {
  console.error('\nVercel environment is incomplete:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('\nThe frontend does not deploy the Python API. Deploy the backend separately first,')
  console.error('then set VITE_API_BASE_URL to its public /api/v1 URL.\n')
  process.exit(1)
}

console.log(`Vercel API base: ${apiBase}`)
