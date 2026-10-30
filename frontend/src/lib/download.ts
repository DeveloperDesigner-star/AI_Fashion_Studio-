import { api } from '@/lib/api'

/** Download an authenticated API resource (technical pack, print proof, export). */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await api.raw(path)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}
