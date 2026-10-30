import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/stores/toastStore'
import { Button, LinkButton } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Badge, EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui/Primitives'
import { formatDate, titleCase } from '@/lib/format'
import { dpiGuidance, printStatusLabels } from '@/lib/marketplace'
import type { PrintPackage } from '@/lib/types'

export const printStatusTone: Record<string, 'neutral' | 'ink' | 'olive' | 'gold' | 'danger'> = {
  draft: 'neutral',
  in_review: 'gold',
  approved: 'olive',
  changes_requested: 'danger',
}

export function PrintPackagesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<'mine' | 'shared'>('mine')
  const [packageForm, setPackageForm] = useState({
    design_id: '',
    name: '',
    width_cm: '30',
    height_cm: '40',
    bleed_mm: '0',
    dpi: '300',
    color_profile: 'srgb',
    transparent_background: true,
    notes: '',
    components: [] as string[],
    component_sizes: {} as Record<string, { width: string; height: string }>,
  })

  const packages = useQuery({
    queryKey: qk.printPackages(form),
    queryFn: () => fetchers.printPackages(form),
  })
  const capabilities = useQuery({ queryKey: qk.printCapabilities, queryFn: fetchers.printCapabilities })
  const designs = useQuery({
    queryKey: qk.designs({ limit: 60 }),
    queryFn: () => fetchers.designs({ limit: 60 }),
    enabled: Boolean(user),
  })

  const selectedDesign = useMemo(
    () => designs.data?.items.find((design) => design.id === packageForm.design_id),
    [designs.data, packageForm.design_id],
  )
  const componentIds = useMemo(
    () => Object.keys(selectedDesign?.components ?? {}),
    [selectedDesign],
  )

  const createPackage = useMutation({
    mutationFn: () =>
      fetchers.createPrintPackage({
        design_id: packageForm.design_id,
        name: packageForm.name.trim(),
        width_cm: Number(packageForm.width_cm),
        height_cm: Number(packageForm.height_cm),
        bleed_mm: Number(packageForm.bleed_mm),
        dpi: Number(packageForm.dpi),
        color_profile: packageForm.color_profile,
        transparent_background: packageForm.transparent_background,
        notes: packageForm.notes.trim() || null,
        components: (packageForm.components.length ? packageForm.components : componentIds).map((componentId) => {
          const override = packageForm.component_sizes[componentId]
          return {
            component_id: componentId,
            width_cm: override?.width ? Number(override.width) : Number(packageForm.width_cm),
            height_cm: override?.height ? Number(override.height) : Number(packageForm.height_cm),
          }
        }),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: qk.printPackages('mine') })
      setOpen(false)
      toast.success('Print package built', `${created.files.length} component file(s) prepared. Review the DPI report before submitting.`)
      navigate(`/print/${created.id}`)
    },
    onError: (error) =>
      toast.error('Package not built', error instanceof ApiError ? error.message : 'Try again.'),
  })

  const items = packages.data?.items ?? []

  return (
    <div className="shell py-10">
      <PageHeader
        eyebrow="Print preparation"
        title="Print packages"
        description="Production artwork for the components you customised — separate from AI previews. Check DPI, print area, colour profile and transparency, then export for manual hand-off."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setForm(form === 'mine' ? 'shared' : 'mine')}>
              {form === 'mine' ? 'Shared with my studio' : 'My packages'}
            </Button>
            <Button size="sm" onClick={() => setOpen(true)} disabled={!designs.data?.items.length}>
              New print package
            </Button>
          </div>
        }
      />

      {capabilities.data && (
        <div className="mt-5 border border-line bg-bone/40 p-4 text-xs leading-relaxed text-ink-muted">
          <p className="label-xs">What this build does</p>
          <p className="mt-2">
            Exports: {capabilities.data.exports.join(', ')} · {capabilities.data.dpi.min}–{capabilities.data.dpi.max} DPI
            (recommended {capabilities.data.dpi.recommended}) · transparent background supported.
          </p>
          <p className="mt-1">
            {capabilities.data.printer_connection
              ? 'A printer connection is configured.'
              : 'No direct printer, RIP or driver connection is implemented. Files are exported for manual hand-off.'}
          </p>
        </div>
      )}

      {packages.isLoading && <LoadingBlock label="Loading print packages" rows={3} />}
      {packages.isError && (
        <div className="mt-6">
          <ErrorState title="Print packages could not be loaded" onRetry={() => packages.refetch()} />
        </div>
      )}

      {!packages.isLoading && !packages.isError && items.length === 0 && (
        <div className="mt-6">
          <EmptyState
            title={form === 'mine' ? 'No print packages yet' : 'No packages shared with your studio'}
            description={
              form === 'mine'
                ? 'Build a package from a saved design. Every component with artwork or a colour gets its own print file.'
                : 'Approved packages attached to your orders appear here with PDF and PNG access.'
            }
            action={
              form === 'mine' ? (
                <Button onClick={() => setOpen(true)} disabled={!designs.data?.items.length}>
                  Prepare a package
                </Button>
              ) : (
                <LinkButton to="/orders">View orders</LinkButton>
              )
            }
          />
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {items.map((item: PrintPackage) => {
          const failed = item.files.filter((file) => !file.dpi_ok).length
          return (
            <article key={item.id} className="flex flex-col border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg leading-tight">{item.name}</h2>
                <Badge tone={printStatusTone[item.status] ?? 'neutral'}>
                  {printStatusLabels[item.status] ?? titleCase(item.status)}
                </Badge>
              </div>
              <p className="mt-1 text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                {item.width_cm} × {item.height_cm} cm · {item.dpi} DPI · {item.color_profile} ·{' '}
                {item.transparent_background ? 'transparent' : 'opaque'}
              </p>
              <p className="mt-2 text-xs text-ink-muted">
                {item.files.length} component file{item.files.length === 1 ? '' : 's'} · {formatDate(item.created_at)}
                {failed > 0 ? ` · ${failed} below target DPI` : ' · all files at target DPI'}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <LinkButton to={`/print/${item.id}`} size="sm">
                  Open
                </LinkButton>
                {item.pdf_url && (
                  <span className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">PDF ready</span>
                )}
                {item.zip_url && (
                  <span className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">PNG ZIP ready</span>
                )}
              </div>
            </article>
          )
        })}
      </div>

      <p className="mt-8 max-w-2xl text-xs leading-relaxed text-ink-muted">{dpiGuidance}</p>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Build a print package"
        description="Files are generated locally from the saved design. Nothing is sent to a printer."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createPackage.mutate()}
              loading={createPackage.isPending}
              disabled={!packageForm.design_id || packageForm.name.trim().length < 2}
            >
              Build package
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Design"
            value={packageForm.design_id}
            onChange={(event) =>
              setPackageForm({ ...packageForm, design_id: event.target.value, components: [] })
            }
            options={[
              { value: '', label: designs.data?.items.length ? 'Choose a saved design' : 'No designs yet' },
              ...(designs.data?.items ?? []).map((design) => ({
                value: design.id,
                label: `${design.name} · ${Object.keys(design.components).length} components`,
              })),
            ]}
          />
          <Input
            label="Package name"
            value={packageForm.name}
            onChange={(event) => setPackageForm({ ...packageForm, name: event.target.value })}
            maxLength={160}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Width (cm)"
              type="number"
              min="5"
              max="150"
              value={packageForm.width_cm}
              onChange={(event) => setPackageForm({ ...packageForm, width_cm: event.target.value })}
            />
            <Input
              label="Height (cm)"
              type="number"
              min="5"
              max="200"
              value={packageForm.height_cm}
              onChange={(event) => setPackageForm({ ...packageForm, height_cm: event.target.value })}
            />
            <Input
              label="Bleed (mm)"
              type="number"
              min="0"
              max="20"
              value={packageForm.bleed_mm}
              onChange={(event) => setPackageForm({ ...packageForm, bleed_mm: event.target.value })}
            />
            <Input
              label="Target DPI"
              type="number"
              min="150"
              max="600"
              value={packageForm.dpi}
              onChange={(event) => setPackageForm({ ...packageForm, dpi: event.target.value })}
            />
            <Select
              label="Colour profile"
              value={packageForm.color_profile}
              onChange={(event) => setPackageForm({ ...packageForm, color_profile: event.target.value })}
              options={[
                { value: 'srgb', label: 'Convert to sRGB' },
                { value: 'source', label: 'Keep source profile' },
              ]}
            />
            <label className="flex items-center gap-2 self-end pb-2 text-xs">
              <input
                type="checkbox"
                checked={packageForm.transparent_background}
                onChange={(event) =>
                  setPackageForm({ ...packageForm, transparent_background: event.target.checked })
                }
              />
              Transparent background
            </label>
          </div>
          {componentIds.length > 0 && (
            <fieldset className="border border-line p-3">
              <legend className="px-1 text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                Components
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {componentIds.map((componentId) => {
                  const checked = packageForm.components.length
                    ? packageForm.components.includes(componentId)
                    : true
                  return (
                    <label key={componentId} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const base = packageForm.components.length
                            ? packageForm.components
                            : componentIds
                          const next = event.target.checked
                            ? [...base, componentId]
                            : base.filter((id) => id !== componentId)
                          const sizes = { ...packageForm.component_sizes }
                          if (event.target.checked && !sizes[componentId]) {
                            sizes[componentId] = {
                              width: packageForm.width_cm,
                              height: packageForm.height_cm,
                            }
                          }
                          setPackageForm({ ...packageForm, components: next, component_sizes: sizes })
                        }}
                      />
                      {componentId.replace(/_/g, ' ')}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}
          {componentIds.length > 0 && (
            <div className="border border-line p-3">
              <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ink-muted">
                Print area per component (cm)
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Defaults to the package size. Sleeves and borders usually need their own panel size.
              </p>
              <div className="mt-2 space-y-2">
                {componentIds.map((componentId) => {
                  const selected = packageForm.components.length
                    ? packageForm.components.includes(componentId)
                    : true
                  if (!selected) return null
                  const size = packageForm.component_sizes[componentId] ?? {
                    width: packageForm.width_cm,
                    height: packageForm.height_cm,
                  }
                  return (
                    <div key={componentId} className="grid grid-cols-[1fr_5rem_5rem] items-end gap-2">
                      <span className="text-xs">{componentId.replace(/_/g, ' ')}</span>
                      <Input
                        label="W"
                        type="number"
                        min="5"
                        max="150"
                        value={size.width}
                        aria-label={`${componentId} print width`}
                        onChange={(event) =>
                          setPackageForm({
                            ...packageForm,
                            component_sizes: {
                              ...packageForm.component_sizes,
                              [componentId]: { ...size, width: event.target.value },
                            },
                          })
                        }
                      />
                      <Input
                        label="H"
                        type="number"
                        min="5"
                        max="200"
                        value={size.height}
                        aria-label={`${componentId} print height`}
                        onChange={(event) =>
                          setPackageForm({
                            ...packageForm,
                            component_sizes: {
                              ...packageForm.component_sizes,
                              [componentId]: { ...size, height: event.target.value },
                            },
                          })
                        }
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <Textarea
            label="Notes for the print operator"
            value={packageForm.notes}
            onChange={(event) => setPackageForm({ ...packageForm, notes: event.target.value })}
            maxLength={2000}
          />
        </div>
      </Modal>
    </div>
  )
}
