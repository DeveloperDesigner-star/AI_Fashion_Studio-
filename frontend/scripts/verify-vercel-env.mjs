/**
 * Vercel builds the frontend only. A relative /api/v1 would point at Vercel itself and every
 * request would 404, so fail the build unless the API origin is explicit.
 */
const apiBase = process.env.VITE_API_BASE_URL?.trim()
const project = process.env.VERCEL_PROJECT_ID ?? 'not running on Vercel'
const environment = process.env.VERCEL_ENV ?? 'local'
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
  console.error(`\nVercel project: ${project}`)
  console.error(`Vercel environment: ${environment}`)
  console.error(`Build working directory: ${process.cwd()}`)
  console.error('\nEnvironment variables are scoped to one Vercel project and one environment.')
  console.error('Set VITE_API_BASE_URL for Production, Preview and Development on the project')
  console.error('that actually serves the frontend, then redeploy that project. The frontend does')
  console.error('not deploy the Python API; deploy the backend separately first.\n')
  process.exit(1)
}

console.log(`Vercel API base: ${apiBase} (project=${project}, environment=${environment})`)
