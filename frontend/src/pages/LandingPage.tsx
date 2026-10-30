import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchers, qk } from '@/lib/queries'
import { useAuthStore } from '@/stores/authStore'
import { AvatarScene } from '@/components/three/AvatarScene'
import { GarmentArt } from '@/components/garment/GarmentArt'
import { GarmentCard } from '@/components/garment/GarmentCard'
import { LinkButton } from '@/components/ui/Button'
import { Badge, LoadingBlock, Skeleton } from '@/components/ui/Primitives'
import { formatPrice, titleCase } from '@/lib/format'
import type { FittingItem } from '@/stores/studioStore'
import type { Garment, Look } from '@/lib/types'

const DEMO_PARAMETERS = {
  height_m: 1.72,
  head_height: 0.224,
  neck_width: 0.12,
  shoulder_width: 0.42,
  chest_width: 0.29,
  chest_depth: 0.19,
  waist_width: 0.24,
  waist_depth: 0.16,
  hip_width: 0.31,
  hip_depth: 0.21,
  torso_length: 0.46,
  leg_length: 0.79,
  thigh_width: 0.15,
  calf_width: 0.12,
  arm_length: 0.58,
  shoulder_slope: 0.014,
  posture: 'upright',
  preset: 'editorial',
  gender_presentation: 'feminine',
  bmi_estimate: 21.4,
  derived_body_shape: 'hourglass',
  fabric_drape: 'fluid',
}

const pillars = [
  {
    number: '01',
    title: 'Component-level design',
    body: 'Colour, fabric, pattern and embroidery are set independently for every panel — body, sleeves, collar, lining, hardware.',
  },
  {
    number: '02',
    title: 'Your body, in 3D',
    body: 'Measurements become a parametric avatar you can rotate through 360° and animate, with garments draped to your own proportions.',
  },
  {
    number: '03',
    title: 'Print-ready output',
    body: 'Seamless repeats and a 300 DPI proof sheet with scale marks — prepared locally with open-source imaging, not a paid cloud render.',
  },
  {
    number: '04',
    title: 'Real production partners',
    body: 'Send a technical pack to tailors, printers and ateliers, negotiate quotes and follow the order in one thread.',
  },
]

export function LandingPage() {
  const user = useAuthStore((state) => state.user)
  const featured = useQuery({
    queryKey: qk.garments({ featured: true, page_size: 8 }),
    queryFn: () => fetchers.garments({ featured: true, page_size: 8 }),
  })
  const looks = useQuery({ queryKey: qk.looks(), queryFn: () => fetchers.looks() })
  const config = useQuery({ queryKey: qk.config, queryFn: fetchers.config, staleTime: 300_000 })

  const demoItems = useMemo<FittingItem[]>(() => {
    const garments = featured.data?.items ?? []
    const choose = (slot: string) => garments.find((garment) => garment.slot === slot)
    const look: Garment[] = [choose('dress'), choose('outerwear'), choose('footwear'), choose('bag')].filter(
      (item): item is Garment => Boolean(item),
    )
    if (look.length < 2) {
      const fallback = (looks.data?.items ?? []).flatMap((item: Look) => item.garments).slice(0, 3)
      return fallback.map((garment) => ({
        key: `${garment.id}:base`,
        slot: garment.slot,
        garment,
        designId: null,
        designName: null,
        components: {},
      }))
    }
    return look.map((garment) => ({
      key: `${garment.id}:base`,
      slot: garment.slot,
      garment,
      designId: null,
      designName: null,
      components: {},
    }))
  }, [featured.data, looks.data])

  const aiConfigured = config.data?.features.ai_provider_configured ?? false

  return (
    <div>
      {/* ---------------------------------------------------------------- hero */}
      <section className="border-b border-line">
        <div className="shell grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="animate-fade-up space-y-7">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="clay">Virtual atelier</Badge>
              <span className="text-[0.625rem] uppercase tracking-[0.18em] text-ink-muted">
                Free to use · no subscription
              </span>
            </div>

            <h1 className="display-xl">
              Design it.
              <br />
              Fit it.
              <br />
              <span className="italic text-clay">Print</span> it.
            </h1>

            <p className="max-w-lg text-[0.9375rem] leading-relaxed text-ink-soft">
              A complete fashion studio in the browser: customise every garment component, build a
              personal avatar from your measurements, try the outfit on in 3D, and send a
              production-ready pack to a tailor or printer.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <LinkButton to={user ? '/fitting-room' : '/register'} size="lg">
                {user ? 'Open the fitting room' : 'Create your avatar'}
              </LinkButton>
              <LinkButton to="/studio/women" size="lg" variant="outline">
                Browse the collection
              </LinkButton>
            </div>

            <dl className="grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6">
              {[
                { label: 'Catalogue pieces', value: featured.data?.total ? `${featured.data.total}+` : '25' },
                { label: 'Customisable parts', value: '4–5' },
                { label: 'AI providers', value: aiConfigured ? 'Connected' : 'Optional' },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="label-xs">{stat.label}</dt>
                  <dd className="mt-1 font-display text-2xl leading-none">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="absolute -left-4 top-6 hidden h-28 w-px bg-line lg:block" />
            <AvatarScene
              parameters={DEMO_PARAMETERS}
              itemsOverride={demoItems}
              className="aspect-[4/5] w-full bg-[#efe9de]"
              showControls={false}
            />
            <div className="flex items-center justify-between border border-t-0 border-line bg-paper px-4 py-3">
              <div>
                <p className="text-[0.5625rem] uppercase tracking-[0.18em] text-ink-muted">Live preview</p>
                <p className="font-display text-sm">Parametric avatar · drag to rotate</p>
              </div>
              <div className="flex items-center gap-1.5">
                {['#efe9de', '#15130f', '#8a5a3b', '#55614c'].map((colour) => (
                  <span
                    key={colour}
                    className="size-3.5 border border-line"
                    style={{ backgroundColor: colour }}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ pillars */}
      <section className="shell py-16">
        <div className="flex flex-col gap-4 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">The platform</p>
            <h2 className="display-lg mt-2 max-w-xl">A studio that ends at production, not at a mood board.</h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
            Every module — design, avatar, fitting room, print preparation, marketplace — writes to
            real database records and exports something a workshop can actually use.
          </p>
        </div>
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((pillar) => (
            <div key={pillar.number} className="bg-paper p-6">
              <span className="font-display text-2xl text-clay">{pillar.number}</span>
              <h3 className="mt-4 font-display text-lg leading-snug">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- collection */}
      <section className="border-y border-line bg-bone/50 py-16">
        <div className="shell">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">The collection</p>
              <h2 className="display-lg mt-2">Editorial pieces, open for customisation</h2>
            </div>
            <div className="flex gap-2">
              <LinkButton to="/studio/women" variant="outline" size="sm">
                Womenswear
              </LinkButton>
              <LinkButton to="/studio/men" variant="outline" size="sm">
                Menswear
              </LinkButton>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.isLoading &&
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="border border-line bg-paper">
                  <Skeleton className="aspect-[4/5] w-full" />
                  <div className="space-y-2 border-t border-line p-4">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            {featured.isError && (
              <p className="col-span-full text-sm text-ink-muted">
                The catalogue could not be loaded. Start the API and refresh this page.
              </p>
            )}
            {featured.data?.items.slice(0, 4).map((garment) => (
              <GarmentCard key={garment.id} garment={garment} />
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- looks */}
      <section className="shell py-16">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <p className="eyebrow">Curated looks</p>
            <h2 className="display-lg">Start from a finished edit</h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              Each look is a real outfit record: load it into your fitting room, swap pieces, adjust
              each component, then save your own version.
            </p>
            <LinkButton to={user ? '/outfits' : '/register'} variant="secondary" size="sm">
              {user ? 'Open your outfit library' : 'Save your first outfit'}
            </LinkButton>
          </div>

          <div className="space-y-px bg-line">
            {looks.isLoading && <LoadingBlock label="Loading looks" />}
            {looks.data?.items.slice(0, 4).map((look) => (
              <Link
                key={look.id}
                to={`/studio/${look.gender === 'menswear' ? 'men' : 'women'}?occasion=${look.occasion}`}
                className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 bg-paper p-4 transition-colors hover:bg-bone/60"
              >
                <div className="flex -space-x-6">
                  {look.garments.slice(0, 3).map((garment) => (
                    <GarmentArt
                      key={garment.id}
                      garment={garment}
                      className="h-16 w-12 bg-bone"
                      showShadow={false}
                    />
                  ))}
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-lg leading-tight">{look.name}</h3>
                  <p className="truncate text-xs text-ink-muted">{look.description}</p>
                  <p className="mt-1 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
                    {titleCase(look.occasion)} · {look.garments.length} pieces ·{' '}
                    {formatPrice(
                      look.garments.reduce((total, garment) => total + garment.base_price_cents, 0),
                    )}
                  </p>
                </div>
                <span className="text-xs uppercase tracking-[0.14em] text-ink-muted transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
            ))}
            {looks.isError && <p className="bg-paper p-4 text-sm text-ink-muted">Looks are unavailable right now.</p>}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ process */}
      <section className="border-y border-line bg-ink py-16 text-paper">
        <div className="shell grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-paper/60">From measurement to garment</p>
            <h2 className="display-lg mt-3">Three steps, no guesswork</h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-paper/70">
              Sizes come from a documented rule engine over standard EU/UK/US charts — never an
              invented number. If measurements fall outside the chart, the studio says so and points
              you to made-to-measure.
            </p>
            <div className="mt-6">
              <LinkButton to="/register" variant="secondary" size="md">
                Begin onboarding
              </LinkButton>
            </div>
          </div>
          <ol className="space-y-px bg-paper/15">
            {[
              {
                step: 'I',
                title: 'Measure',
                detail: 'Height, weight and eight circumference or length measurements, in metric or imperial.',
              },
              {
                step: 'II',
                title: 'Design',
                detail: 'Pick a garment, customise each component, preview on your avatar, save the design.',
              },
              {
                step: 'III',
                title: 'Produce',
                detail: 'Export a technical pack or print sheet, request quotes from ateliers, track the order.',
              },
            ].map((item) => (
              <li key={item.step} className="grid grid-cols-[auto_1fr] gap-5 bg-ink p-5">
                <span className="font-display text-xl text-clay-soft">{item.step}</span>
                <div>
                  <p className="font-display text-lg">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-paper/65">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- ai */}
      <section className="shell grid gap-8 py-16 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="space-y-3">
          <p className="eyebrow">AI, honestly</p>
          <h2 className="display-lg">Model output is labelled. So is the fallback.</h2>
          <p className="max-w-xl text-sm leading-relaxed text-ink-muted">
            Google Gemini is the primary provider, Groq the secondary, and OpenAI stays switched off
            until an operator opts in. Without keys the stylist runs a deterministic rule engine and
            the interface says <em>rule-based</em> — it never dresses a template up as AI.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {(config.data?.providers ?? []).map((provider) => (
              <Badge key={provider.name} tone={provider.usable ? 'olive' : 'neutral'}>
                {provider.label} · {provider.usable ? 'active' : 'off'}
              </Badge>
            ))}
          </div>
        </div>
        <div className="border border-line bg-bone/60 p-6">
          <p className="label-xs">Current instance</p>
          <p className="mt-2 font-display text-2xl leading-snug">
            {aiConfigured ? 'Generative styling enabled' : 'Offline styling engine'}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            {aiConfigured
              ? 'Prompts are sent only to the configured provider. Uploads stay on this server; no image is shared unless you explicitly run design analysis.'
              : 'No API key is present. The stylist builds looks from the catalogue and your measurements, and design analysis returns local pixel metrics only.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-[0.625rem] uppercase tracking-[0.14em] text-ink-muted">
            <span className="border border-line px-2 py-1">No paid API by default</span>
            <span className="border border-line px-2 py-1">Daily fair-use limits</span>
            <span className="border border-line px-2 py-1">Keys server-side only</span>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- marketplace */}
      <section className="border-t border-line">
        <div className="shell flex flex-col gap-6 py-14 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow">Production network</p>
            <h2 className="display-md mt-2 max-w-xl">
              Take the design to a tailor, printer or atelier — with the technical pack attached.
            </h2>
          </div>
          <LinkButton to="/marketplace" size="lg">
            Explore partners
          </LinkButton>
        </div>
      </section>
    </div>
  )
}
