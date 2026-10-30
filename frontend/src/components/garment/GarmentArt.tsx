import type { ComponentCustomisation, Garment } from '@/lib/types'

/**
 * Procedural flat-lay garment illustration.
 *
 * Everything is drawn from the catalogue's silhouette + palette, so the studio
 * ships without third-party photography and every component colour change is
 * reflected immediately in the artwork.
 */

interface GarmentArtProps {
  garment: Pick<Garment, 'silhouette' | 'palette' | 'default_color' | 'slot' | 'name'>
  components?: Record<string, ComponentCustomisation>
  className?: string
  showShadow?: boolean
}

function pick(
  garment: GarmentArtProps['garment'],
  components: Record<string, ComponentCustomisation> | undefined,
  keys: string[],
): string {
  if (components) {
    for (const key of keys) {
      const value = components[key]
      if (value?.color) return value.color
    }
  }
  return garment.palette?.primary ?? garment.default_color ?? '#1f1d1a'
}

function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((char) => char + char).join('') : value
  const number = Number.parseInt(full, 16)
  if (Number.isNaN(number)) return hex
  const clamp = (channel: number) => Math.max(0, Math.min(255, Math.round(channel)))
  const r = clamp(((number >> 16) & 255) + amount)
  const g = clamp(((number >> 8) & 255) + amount)
  const b = clamp((number & 255) + amount)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

const outline = '#15130f'

export function GarmentArt({ garment, components, className, showShadow = true }: GarmentArtProps) {
  const primary = pick(garment, components, ['body', 'upper', 'case'])
  const secondary = pick(garment, components, ['sleeves', 'legs', 'strap', 'handle'])
  const accent = pick(garment, components, ['collar', 'lapels', 'neckline', 'dial', 'hardware'])
  const detail = shade(primary, -28)
  const highlight = shade(primary, 24)
  const silhouette = garment.silhouette
  const slot = garment.slot

  const stroke = { stroke: outline, strokeOpacity: 0.16, strokeWidth: 1.2, strokeLinejoin: 'round' as const }

  const art = (() => {
    if (slot === 'bottom') {
      if (silhouette === 'pleated') {
        return (
          <g>
            <path d="M88 84h64l10 178H78L88 84Z" fill={primary} {...stroke} />
            {[96, 108, 120, 132, 144].map((x) => (
              <path key={x} d={`M${x} 84 L${x - 6} 262`} stroke={outline} strokeOpacity="0.18" strokeWidth="1.4" />
            ))}
            <rect x="88" y="76" width="64" height="16" rx="1.5" fill={secondary} {...stroke} />
          </g>
        )
      }
      if (silhouette === 'wide_leg') {
        return (
          <g>
            <path d="M84 82h72l8 182h-42l-4-118-4 118H72L84 82Z" fill={primary} {...stroke} />
            <rect x="82" y="72" width="76" height="18" rx="1.5" fill={secondary} {...stroke} />
            <path d="M104 96h32" stroke={detail} strokeWidth="2.2" strokeLinecap="round" />
          </g>
        )
      }
      return (
        <g>
          <path d="M88 82h64l4 178h-30l-6-116-6 116H80L88 82Z" fill={primary} {...stroke} />
          <rect x="86" y="72" width="68" height="17" rx="1.5" fill={secondary} {...stroke} />
          <path d="M120 96v150" stroke={detail} strokeWidth="2" strokeLinecap="round" />
          <path d="M120 100v40" stroke={highlight} strokeWidth="1.4" strokeLinecap="round" />
        </g>
      )
    }

    if (slot === 'dress') {
      if (silhouette === 'gown') {
        return (
          <g>
            <path d="M96 66c6 10 16 16 24 16s18-6 24-16l16 74-6 138H86L80 140l16-74Z" fill={primary} {...stroke} />
            <path d="M96 66c6 10 16 16 24 16s18-6 24-16-8-18-24-18-30 8-24 18Z" fill={accent} {...stroke} />
            <path d="M120 82v196" stroke={detail} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5" />
            <path d="M86 216c20 8 48 8 68 0" stroke={highlight} strokeWidth="1.6" strokeOpacity="0.6" fill="none" />
          </g>
        )
      }
      if (silhouette === 'shirt') {
        return (
          <g>
            <path d="M92 74h56l8 186H84L92 74Z" fill={primary} {...stroke} />
            <path d="M104 74l16 18 16-18" fill={accent} {...stroke} />
            <path d="M120 92v168" stroke={detail} strokeWidth="2" />
            <path d="M92 74l-16 22 8 34 12-8" fill={secondary} {...stroke} />
            <path d="M148 74l16 22-8 34-12-8" fill={secondary} {...stroke} />
            <rect x="86" y="196" width="68" height="10" fill={secondary} {...stroke} opacity="0.9" />
          </g>
        )
      }
      return (
        <g>
          <path d="M98 70h44l14 74-8 118h-56l-8-118 14-74Z" fill={primary} {...stroke} />
          <path d="M104 70c4 12 10 20 16 20s12-8 16-20" fill="none" stroke={accent} strokeWidth="3.4" />
          <path d="M108 60l12 12 12-12" stroke={secondary} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M120 90v170" stroke={detail} strokeWidth="1.6" strokeOpacity="0.45" />
        </g>
      )
    }

    if (slot === 'footwear') {
      if (silhouette === 'pump') {
        return (
          <g>
            <path d="M70 196c26-2 48-12 62-34 8-12 16-14 20-4l8 38c2 10-6 16-18 16H78c-10 0-14-6-8-16Z" fill={primary} {...stroke} />
            <path d="M160 192l6 22" stroke={secondary} strokeWidth="5" strokeLinecap="round" />
            <path d="M70 208h90" stroke={outline} strokeOpacity="0.4" strokeWidth="2" />
          </g>
        )
      }
      if (silhouette === 'sneaker') {
        return (
          <g>
            <path d="M66 196c18 0 30-6 42-18 8-8 16-8 22-2l16 16c10 0 16 6 16 14v8H70c-8 0-10-8-4-18Z" fill={primary} {...stroke} />
            <path d="M62 214h102" stroke={outline} strokeWidth="3" strokeLinecap="round" />
            <path d="M92 178l16 12M104 168l14 14" stroke={accent} strokeWidth="4" strokeLinecap="round" />
          </g>
        )
      }
      return (
        <g>
          <path d="M68 192c22 4 42-2 56-14 8-8 18-8 22 0l10 22c4 8-2 14-12 14H76c-10 0-14-8-8-22Z" fill={primary} {...stroke} />
          <path d="M66 208h96" stroke={outline} strokeWidth="3" strokeLinecap="round" />
          <path d="M98 178l10 10M110 170l12 12" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        </g>
      )
    }

    if (slot === 'bag') {
      return (
        <g>
          <path d="M76 128h88l8 112H68l8-112Z" fill={primary} {...stroke} />
          <path d="M96 128V104c0-14 10-24 24-24s24 10 24 24v24" fill="none" stroke={secondary} strokeWidth="6" strokeLinecap="round" />
          <path d="M68 168h104" stroke={detail} strokeWidth="2" />
          <rect x="112" y="160" width="16" height="16" rx="1" fill={accent} {...stroke} />
        </g>
      )
    }

    if (slot === 'watch') {
      return (
        <g>
          <rect x="112" y="52" width="16" height="76" rx="6" fill={secondary} {...stroke} />
          <rect x="112" y="196" width="16" height="72" rx="6" fill={secondary} {...stroke} />
          <circle cx="120" cy="162" r="44" fill={primary} {...stroke} />
          <circle cx="120" cy="162" r="34" fill={accent} fillOpacity="0.22" stroke={outline} strokeOpacity="0.2" />
          <path d="M120 162v-22M120 162l16 10" stroke={outline} strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
          <rect x="155" y="158" width="7" height="9" rx="1" fill={accent} />
        </g>
      )
    }

    if (slot === 'accessory' || silhouette === 'scarf') {
      return (
        <g>
          <path d="M74 120c28 18 64 18 92 0 10-6 18 4 12 14-30 22-86 22-116 0-6-10 2-20 12-14Z" fill={primary} {...stroke} />
          <path d="M108 140l-8 96h22l-6-96Z" fill={secondary} {...stroke} />
          <path d="M74 120c28 18 64 18 92 0" fill="none" stroke={accent} strokeWidth="2.4" strokeOpacity="0.7" />
        </g>
      )
    }

    if (slot === 'headwear') {
      return (
        <g>
          <path d="M68 176c0-38 24-62 52-62s52 24 52 62h-24c0-24-12-38-28-38s-28 14-28 38H68Z" fill={primary} {...stroke} />
          <path d="M64 176h112v10H64z" fill={secondary} {...stroke} />
        </g>
      )
    }

    // Outerwear + tops.
    const long = ['trench', 'overcoat', 'coat'].includes(silhouette)
    const hem = long ? 262 : slot === 'outerwear' ? 246 : 228
    return (
      <g>
        <path
          d={`M94 74 120 66l26 8 30 20-10 34-14-8v${hem - 120}h-64V${120}l-14 8-10-34 30-20Z`}
          fill={primary}
          {...stroke}
        />
        <path d={`M94 74 120 66l26 8-26 30-26-30Z`} fill={accent} {...stroke} />
        {['blazer', 'suit', 'trench', 'overcoat', 'chore'].includes(silhouette) && (
          <>
            <path d={`M120 104 L136 74 L152 94 L132 ${hem - 12} H120 V104Z`} fill={secondary} {...stroke} />
            <path d={`M120 104 L104 74 L88 94 L108 ${hem - 12} H120 V104Z`} fill={shade(primary, -8)} {...stroke} />
            <path d="M120 120v110" stroke={outline} strokeOpacity="0.22" strokeWidth="1.6" />
            {long && <path d="M88 176h64" stroke={secondary} strokeWidth="5" strokeOpacity="0.85" />}
          </>
        )}
        {silhouette === 'shirt' && (
          <>
            <path d="M120 96v120" stroke={detail} strokeWidth="2" />
            {[132, 156, 180, 204].map((y) => (
              <circle key={y} cx="120" cy={y} r="2.4" fill={outline} fillOpacity="0.5" />
            ))}
          </>
        )}
        {silhouette === 'knit' && (
          <path d="M104 96c8 10 24 10 32 0" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />
        )}
        <path d="M96 78l-6 20M144 78l6 20" stroke={outline} strokeOpacity="0.15" strokeWidth="1.2" />
      </g>
    )
  })()

  return (
    <svg
      viewBox="0 0 240 300"
      className={className}
      role="img"
      aria-label={`${garment.name} illustration`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {showShadow && <ellipse cx="120" cy="282" rx="66" ry="7" fill="#15130f" fillOpacity="0.07" />}
      {art}
    </svg>
  )
}
