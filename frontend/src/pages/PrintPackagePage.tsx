import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiBaseUrl, ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge, ErrorState, LoadingBlock, Notice } from '@/components/ui/Primitives'
import { formatDateTime } from '@/lib/format'
import { dpiGuidance, printStatusLabels } from '@/lib/marketplace'
import { printStatusTone } from '@/pages/PrintPackagesPage'
import type { PrintFile } from '@/lib/types'

function relativeUrl(url: string): string {
  return url.startsWith(apiBaseUrl) ? url.slice(apiBaseUrl.length) : url
}

async function download(url: string, fallbackName: string) {
  const response = await api.raw(relativeUrl(url))
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fallbackName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

function FilePreview({ file }: { file: PrintFile }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    if (!file.preview_url) return
    api
      .raw(relativeUrl(file.preview_url))
      .then((response) => response.blob())
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch(() => setSrc(null))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file.preview_url])

  if (!src) {
    return (
      <div className="flex h-24 w-24 items-center justify-center bg-bone text-[0.5625rem] uppercase tracking-[0.12em] text-ink-muted">
        No preview
      </div>
    )
  }
  return <img src={src} alt={`${file.label} print preview`} className="h-24 w-24 border border-line object-contain" />
}

export function PrintPackagePage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [changesOpen, setChangesOpen] = useState(false)
  const [reason, setReason] = useState('')

  const packageQuery = useQuery({
    queryKey: qk.printPackage(id),
    queryFn: () => fetchers.printPackage(id),
    enabled: Boolean(id),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: qk.printPackage(id) })
    queryClient.invalidateQueries({ queryKey: qk.printPackages('mine') })
    queryClient.invalidateQueries({ queryKey: qk.printPackages('shared') })
  }

  const submit = useMutation({
    mutationFn: () => fetchers.submitPrintPackage(id),
    onSuccess: () => {
      invalidate()
      toast.success('Package submitted for review')
    },
    onError: (error) => toast.error('Not submitted', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const approve = useMutation({
    mutationFn: () => fetchers.approvePrintPackage(id),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: qk.requests('outgoing') })
      toast.success('Artwork approved', 'Linked orders move to design approved.')
    },
    onError: (error) => toast.error('Not approved', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const requestChanges = useMutation({
    mutationFn: () => fetchers.requestPrintChanges(id, reason.trim()),
    onSuccess: () => {
      invalidate()
      setChangesOpen(false)
      setReason('')
      toast.success('Changes requested')
    },
    onError: (error) => toast.error('Not sent', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const exportFile = useMutation({
    mutationFn: async (format: 'pdf' | 'png_zip') => {
      const result = await fetchers.exportPrintPackage(id, format)
      await download(result.download_url, result.filename)
    },
    onSuccess: () => toast.success('Download started'),
    onError: (error) => toast.error('Export failed', error instanceof ApiError ? error.message : 'Try again.'),
  })

  if (packageQuery.isLoading) {
    return (
      <div className="shell py-12">
        <LoadingBlock label="Loading print package" rows={4} />
      </div>
    )
  }

  if (packageQuery.isError || !packageQuery.data) {
    return (
      <div className="shell py-12">
        <ErrorState title="This print package could not be loaded" message="It may belong to another account." />
      </div>
    )
  }

  const data = packageQuery.data
  const isOwner = data.user_id === user?.id || user?.role === 'admin'
  const failed = data.files.filter((file) => !file.dpi_ok)
  const skipped = (data.manifest.skipped as { component_id: string; reason: string }[] | undefined) ?? []

  return (
    <div className="shell py-10">
      <nav className="mb-5 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
        <Link to="/print" className="hover:text-ink">
          Print packages
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span>{data.name}</span>
      </nav>

      <header className="border border-line bg-paper p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={printStatusTone[data.status] ?? 'neutral'}>
            {printStatusLabels[data.status] ?? data.status}
          </Badge>
          <Badge tone="neutral">Production artwork</Badge>
          {data.is_ai_preview && <Badge tone="danger">AI preview</Badge>}
        </div>
        <h1 className="display-md mt-3">{data.name}</h1>
        <p className="mt-2 text-xs text-ink-muted">
          Generated {formatDateTime(data.created_at)} · {data.files.length} component files
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 text-xs sm:grid-cols-5">
          <div>
            <dt className="label-xs">Print area</dt>
            <dd className="mt-1">
              {data.width_cm} × {data.height_cm} cm
            </dd>
          </div>
          <div>
            <dt className="label-xs">Bleed</dt>
            <dd className="mt-1">{data.bleed_mm} mm</dd>
          </div>
          <div>
            <dt className="label-xs">Target DPI</dt>
            <dd className="mt-1">{data.dpi}</dd>
          </div>
          <div>
            <dt className="label-xs">Colour</dt>
            <dd className="mt-1">{data.color_profile === 'source' ? 'Source profile kept' : 'Converted to sRGB'}</dd>
          </div>
          <div>
            <dt className="label-xs">Background</dt>
            <dd className="mt-1">{data.transparent_background ? 'Transparent' : 'Opaque'}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          {data.pdf_url && (
            <Button size="sm" onClick={() => exportFile.mutate('pdf')} loading={exportFile.isPending}>
              Download PDF
            </Button>
          )}
          {data.zip_url && (
            <Button size="sm" variant="outline" onClick={() => exportFile.mutate('png_zip')}>
              Download PNG files (ZIP)
            </Button>
          )}
          {isOwner && (data.status === 'draft' || data.status === 'changes_requested') && (
            <Button size="sm" variant="outline" onClick={() => submit.mutate()} loading={submit.isPending}>
              Submit for review
            </Button>
          )}
          {isOwner && data.status === 'in_review' && (
            <>
              <Button size="sm" onClick={() => approve.mutate()} loading={approve.isPending}>
                Approve artwork
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setChangesOpen(true)}>
                Request changes
              </Button>
            </>
          )}
        </div>
        {data.status === 'changes_requested' && data.rejection_reason && (
          <div className="mt-4">
            <Notice tone="warn">Changes requested: {data.rejection_reason}</Notice>
          </div>
        )}
        {data.notes && <p className="mt-4 text-xs text-ink-muted">Operator notes: {data.notes}</p>}
      </header>

      {failed.length > 0 && (
        <div className="mt-5">
          <Notice tone="warn">
            {failed.length} component file{failed.length === 1 ? '' : 's'} below the {data.dpi} DPI target. Files are not
            upscaled; re-upload higher-resolution artwork or reduce the print size.
          </Notice>
        </div>
      )}

      <section className="mt-6 border border-line bg-paper">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-display text-xl">Component files</h2>
          <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
            One file per customised component, kept separate from AI previews
          </p>
        </div>
        <ul className="divide-y divide-line">
          {data.files.map((file) => (
            <li key={file.id} className="flex flex-col gap-4 px-4 py-4 sm:flex-row">
              <FilePreview file={file} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-lg leading-tight">{file.label}</h3>
                  <Badge tone={file.dpi_ok ? 'olive' : 'gold'}>{file.effective_dpi} DPI</Badge>
                  <Badge tone="neutral">{file.has_transparency ? 'Alpha channel' : 'Opaque'}</Badge>
                  <Badge tone="neutral">{file.source === 'solid_colour' ? 'Solid colour' : 'Print artwork'}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {file.width_px} × {file.height_px} px at {file.target_width_cm} × {file.target_height_cm} cm ·{' '}
                  {file.color_space} · {file.color_profile}
                </p>
                {file.warnings.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-muted">
                    {file.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap gap-3 text-[0.625rem] uppercase tracking-[0.12em]">
                  {file.content_url && (
                    <button
                      type="button"
                      className="text-ink-muted underline decoration-line hover:text-ink"
                      onClick={() => download(file.content_url!, `${file.component_id}.png`)}
                    >
                      Download PNG
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {skipped.length > 0 && (
          <div className="border-t border-line px-4 py-3 text-xs text-ink-muted">
            <p className="label-xs">Not included</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {skipped.map((item) => (
                <li key={item.component_id}>
                  {item.component_id.replace(/_/g, ' ')} — {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="border border-line bg-paper p-4 text-xs leading-relaxed text-ink-muted">
          <p className="label-xs">Print operator hand-off</p>
          <p className="mt-2">
            The PDF places every component at its exact physical size with a 100% scale instruction. Transparent areas
            stay transparent; colour is not soft-proofed for a specific press.
          </p>
          <p className="mt-2">There is no direct printer or RIP connection. Files are downloaded and sent manually.</p>
        </div>
        <div className="border border-line bg-bone/40 p-4 text-xs leading-relaxed text-ink-muted">
          <p className="label-xs">DPI</p>
          <p className="mt-2">{dpiGuidance}</p>
        </div>
      </section>

      <Modal
        open={changesOpen}
        onClose={() => setChangesOpen(false)}
        title="Request changes"
        description="Describe exactly what needs to change before printing."
        footer={
          <>
            <Button variant="ghost" onClick={() => setChangesOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => requestChanges.mutate()}
              loading={requestChanges.isPending}
              disabled={reason.trim().length < 4}
            >
              Send back
            </Button>
          </>
        }
      >
        <Textarea
          label="What needs changing?"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={2000}
        />
      </Modal>
    </div>
  )
}
