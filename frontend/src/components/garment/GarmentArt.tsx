import type { ComponentCustomisation, Garment } from '@/lib/types'

/**
 * Procedural flat-lay garment illustration.
 *
 * Every piece in the catalogue is drawn from its `silhouette`, `slot` and
 * `palette`, so the studio ships without third-party photography and each
 * component colour change is reflected immediately in the artwork. Silhouettes
 * are original vector work authored for this project.
 */

interface GarmentArtProps {
  garment: Pick<Garment, 'silhouette' | 'palette' | 'default_color' | 'slot' | 'name'> & {
    category?: string
  }
  components?: Record<string, ComponentCustomisation>
  className?: string
  showShadow?: boolean
  /** Try-on colour choice; overrides the primary body colour only. */
  colorOverride?: string | null
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
const line = { stroke: outline, strokeOpacity: 0.16, strokeWidth: 1.2, strokeLinejoin: 'round' as const }

interface Palette {
  primary: string
  secondary: string
  accent: string
  detail: string
  highlight: string
}

export function GarmentArt({
  garment,
  components,
  className,
  showShadow = true,
  colorOverride,
}: GarmentArtProps) {
  const primary = colorOverride || pick(garment, components, ['body', 'upper', 'case'])
  const secondary = pick(garment, components, ['sleeves', 'legs', 'strap', 'handle', 'dupatta', 'pleats'])
  const accent = pick(garment, components, ['collar', 'lapels', 'neckline', 'dial', 'hardware', 'borders'])
  const palette: Palette = {
    primary,
    secondary,
    accent,
    detail: shade(primary, -28),
    highlight: shade(primary, 24),
  }
  const silhouette = garment.silhouette
  const slot = garment.slot

  const art = (() => {
    // ---------------------------------------------------------------- bottoms
    if (slot === 'bottom') {
      if (silhouette === 'jeans') {
        return (
          <g>
            <path d="M86 76h68l6 186h-34l-4-96-4 96H72L86 76Z" fill={primary} {...line} />
            <rect x="84" y="66" width="72" height="18" rx="1.5" fill={secondary} {...line} />
            <path d="M104 84h32M104 76h32" stroke={palette.detail} strokeWidth="2" strokeLinecap="round" />
            <path d="M120 96v60" stroke={palette.detail} strokeWidth="1.6" strokeOpacity="0.6" />
            <path d="M88 150h18M134 150h18" stroke={palette.highlight} strokeWidth="1.4" strokeLinecap="round" />
            <path d="M94 76h52" stroke={outline} strokeOpacity="0.25" strokeWidth="1.4" />
          </g>
        )
      }
      if (silhouette === 'pleated') {
        return (
          <g>
            <path d="M88 84h64l10 178H78L88 84Z" fill={primary} {...line} />
            {[96, 108, 120, 132, 144].map((x) => (
              <path key={x} d={`M${x} 84 L${x - 6} 262`} stroke={outline} strokeOpacity="0.18" strokeWidth="1.4" />
            ))}
            <rect x="88" y="76" width="64" height="16" rx="1.5" fill={secondary} {...line} />
          </g>
        )
      }
      if (silhouette === 'wide_leg') {
        return (
          <g>
            <path d="M84 82h72l8 182h-42l-4-118-4 118H72L84 82Z" fill={primary} {...line} />
            <rect x="82" y="72" width="76" height="18" rx="1.5" fill={secondary} {...line} />
            <path d="M104 96h32" stroke={palette.detail} strokeWidth="2.2" strokeLinecap="round" />
          </g>
        )
      }
      return (
        <g>
          <path d="M88 82h64l4 178h-30l-6-116-6 116H80L88 82Z" fill={primary} {...line} />
          <rect x="86" y="72" width="68" height="17" rx="1.5" fill={secondary} {...line} />
          <path d="M120 96v150" stroke={palette.detail} strokeWidth="2" strokeLinecap="round" />
          <path d="M120 100v40" stroke={palette.highlight} strokeWidth="1.4" strokeLinecap="round" />
        </g>
      )
    }

    // ------------------------------------------------------------------ dress
    if (slot === 'dress') {
      if (silhouette === 'shalwar_kameez') {
        return (
          <g>
            {/* kameez */}
            <path d="M96 58h48l16 22-4 30-10-2v78H94V108l-10 2-4-30 16-22Z" fill={primary} {...line} />
            <path d="M110 58h20l6 16h-32l6-16Z" fill={palette.accent} {...line} />
            <path d="M120 74v112" stroke={palette.detail} strokeWidth="1.6" strokeOpacity="0.55" />
            <path d="M94 158h52" stroke={palette.secondary} strokeWidth="4" strokeOpacity="0.8" />
            {/* shalwar */}
            <path d="M96 186h48l14 76h-32l-6-54-6 54H82l14-76Z" fill={palette.secondary} {...line} />
            <path d="M96 190h48" stroke={outline} strokeOpacity="0.22" strokeWidth="1.4" />
            {/* dupatta drape */}
            <path d="M150 70c14 22 16 74 4 118" stroke={palette.accent} strokeWidth="2.4" strokeOpacity="0.8" fill="none" strokeLinecap="round" />
          </g>
        )
      }
      if (silhouette === 'kurta_pajama' || silhouette === 'kurta') {
        return (
          <g>
            <path d="M98 56h44l14 20-4 28-8-2v80H96v-80l-8 2-4-28 14-20Z" fill={primary} {...line} />
            <path d="M108 56h24v16h-24z" fill={palette.accent} {...line} />
            {[92, 108].map((y) => (
              <circle key={y} cx="120" cy={y + 26} r="2.2" fill={outline} fillOpacity="0.45" />
            ))}
            <path d="M96 182h48v10H96z" fill={palette.secondary} {...line} />
            {silhouette === 'kurta_pajama' && (
              <g>
                <path d="M100 192h18l-4 74h-18l4-74Z" fill={secondary} {...line} />
                <path d="M122 192h18l4 74h-18l-4-74Z" fill={secondary} {...line} />
                <path d="M100 194h20M120 194h20" stroke={outline} strokeOpacity="0.2" strokeWidth="1.2" />
              </g>
            )}
            <path d="M120 72v96" stroke={palette.detail} strokeWidth="1.4" strokeOpacity="0.5" />
          </g>
        )
      }
      if (silhouette === 'sherwani') {
        return (
          <g>
            <path d="M96 52h48l18 24-6 34-10-2v96H94v-96l-10 2-6-34 18-24Z" fill={primary} {...line} />
            <path d="M109 52h22v18h-22z" fill={palette.accent} {...line} />
            <path d="M120 70v134" stroke={palette.detail} strokeWidth="2" strokeOpacity="0.65" />
            {[92, 112, 132, 152, 172].map((y) => (
              <circle key={y} cx="120" cy={y} r="2.3" fill={palette.accent} fillOpacity="0.9" />
            ))}
            <path d="M94 206h52v10H94z" fill={palette.secondary} {...line} />
            <path d="M94 52c-6 30-6 90 0 120M146 52c6 30 6 90 0 120" stroke={palette.accent} strokeWidth="1.6" strokeOpacity="0.7" fill="none" />
          </g>
        )
      }
      if (silhouette === 'kurti') {
        return (
          <g>
            <path d="M96 58h48l16 20-6 30-8-2v76H94v-76l-8 2-6-30 16-20Z" fill={primary} {...line} />
            <path d="M108 58h24v14h-24z" fill={palette.accent} {...line} />
            <path d="M94 158h52" stroke={palette.secondary} strokeWidth="3.4" />
            <path d="M120 74v84" stroke={palette.detail} strokeWidth="1.4" strokeOpacity="0.5" />
            <path d="M94 176h52v6H94z" fill={palette.secondary} {...line} opacity="0.9" />
          </g>
        )
      }
      if (silhouette === 'lehenga') {
        return (
          <g>
            {/* choli */}
            <path d="M104 52h32l10 14-2 18-10-2v22h-28V82l-10 2-2-18 10-14Z" fill={primary} {...line} />
            <path d="M104 52h32" stroke={palette.accent} strokeWidth="3" />
            {/* lehenga skirt */}
            <path d="M92 118h56l34 128H58L92 118Z" fill={secondary} {...line} />
            {[76, 96, 120, 144, 164].map((x) => (
              <path key={x} d={`M${x} 132 L${x - 24} 246`} stroke={outline} strokeOpacity="0.14" strokeWidth="1.6" />
            ))}
            <path d="M58 216c40 12 84 12 124 0" stroke={palette.accent} strokeWidth="5" fill="none" />
            <rect x="90" y="112" width="60" height="12" rx="1.4" fill={palette.accent} {...line} />
          </g>
        )
      }
      if (silhouette === 'saree') {
        return (
          <g>
            <path d="M96 58h48l14 22-6 28-8-2v76H94v-76l-8 2-6-28 14-22Z" fill={primary} {...line} />
            <path d="M94 182h52v8H94z" fill={palette.accent} {...line} />
            <path d="M150 70c22 30 22 76 4 116-8 18-18 26-30 30" stroke={palette.accent} strokeWidth="7" fill="none" strokeOpacity="0.9" strokeLinecap="round" />
            <path d="M150 70c22 30 22 76 4 116-8 18-18 26-30 30" stroke={palette.secondary} strokeWidth="2.4" fill="none" strokeOpacity="0.9" strokeLinecap="round" />
            <path d="M120 96v80" stroke={palette.detail} strokeWidth="1.4" strokeOpacity="0.45" />
            {[104, 124, 144].map((x) => (
              <path key={x} d={`M${x} 190 L${x - 6} 262`} stroke={palette.detail} strokeWidth="1.2" strokeOpacity="0.5" />
            ))}
          </g>
        )
      }
      if (silhouette === 'frock') {
        return (
          <g>
            <path d="M100 60h40l12 18-4 22-8-2 6 34-24 30-24-30 6-34-8 2-4-22 12-18Z" fill={primary} {...line} />
            <path d="M104 60c2 10 8 16 16 16s14-6 16-16" fill="none" stroke={palette.accent} strokeWidth="2.6" />
            <path d="M74 168h92l-18 66H92l-18-66Z" fill={secondary} {...line} />
            {[92, 108, 124, 140].map((x) => (
              <path key={x} d={`M${x} 172 L${x - 8} 230`} stroke={outline} strokeOpacity="0.16" strokeWidth="1.4" />
            ))}
            <path d="M96 118h48" stroke={palette.accent} strokeWidth="4" />
          </g>
        )
      }
      if (silhouette === 'maxi') {
        return (
          <g>
            <path d="M98 56h44l12 24-4 24-8-2 10 76-4 58H84l-4-58 10-76-8 2-4-24 12-24Z" fill={primary} {...line} />
            <path d="M104 56c4 12 10 18 16 18s12-6 16-18" fill="none" stroke={palette.accent} strokeWidth="2.6" />
            <path d="M96 120h48" stroke={palette.secondary} strokeWidth="3" />
            <path d="M86 210h68" stroke={palette.detail} strokeWidth="1.6" strokeOpacity="0.5" />
            <path d="M120 132v78" stroke={palette.detail} strokeWidth="1.4" strokeOpacity="0.35" />
          </g>
        )
      }
      if (silhouette === 'gown') {
        return (
          <g>
            <path d="M96 66c6 10 16 16 24 16s18-6 24-16l16 74-6 138H86L80 140l16-74Z" fill={primary} {...line} />
            <path d="M96 66c6 10 16 16 24 16s18-6 24-16-8-18-24-18-30 8-24 18Z" fill={accent} {...line} />
            <path d="M120 82v196" stroke={palette.detail} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5" />
            <path d="M86 216c20 8 48 8 68 0" stroke={palette.highlight} strokeWidth="1.6" strokeOpacity="0.6" fill="none" />
          </g>
        )
      }
      if (silhouette === 'shirt') {
        return (
          <g>
            <path d="M92 74h56l8 186H84L92 74Z" fill={primary} {...line} />
            <path d="M104 74l16 18 16-18" fill={accent} {...line} />
            <path d="M120 92v168" stroke={palette.detail} strokeWidth="2" />
            <path d="M92 74l-16 22 8 34 12-8" fill={secondary} {...line} />
            <path d="M148 74l16 22-8 34-12-8" fill={secondary} {...line} />
            <rect x="86" y="196" width="68" height="10" fill={secondary} {...line} opacity="0.9" />
          </g>
        )
      }
      return (
        <g>
          <path d="M98 70h44l14 74-8 118h-56l-8-118 14-74Z" fill={primary} {...line} />
          <path d="M104 70c4 12 10 20 16 20s12-8 16-20" fill="none" stroke={accent} strokeWidth="3.4" />
          <path d="M108 60l12 12 12-12" stroke={secondary} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M120 90v170" stroke={palette.detail} strokeWidth="1.6" strokeOpacity="0.45" />
        </g>
      )
    }

    // --------------------------------------------------------------- footwear
    if (slot === 'footwear') {
      if (silhouette === 'pump' || silhouette === 'heel') {
        return (
          <g>
            <path d="M70 196c26-2 48-12 62-34 8-12 16-14 20-4l8 38c2 10-6 16-18 16H78c-10 0-14-6-8-16Z" fill={primary} {...line} />
            <path d="M160 192l6 22" stroke={secondary} strokeWidth="5" strokeLinecap="round" />
            <path d="M70 208h90" stroke={outline} strokeOpacity="0.4" strokeWidth="2" />
            {silhouette === 'heel' && <path d="M96 172c10 6 20 8 30 8" stroke={accent} strokeWidth="2.4" fill="none" />}
          </g>
        )
      }
      if (silhouette === 'sneaker' || silhouette === 'trail') {
        return (
          <g>
            <path d="M66 196c18 0 30-6 42-18 8-8 16-8 22-2l16 16c10 0 16 6 16 14v8H70c-8 0-10-8-4-18Z" fill={primary} {...line} />
            <path d="M62 214h102" stroke={outline} strokeWidth="3" strokeLinecap="round" />
            <path d="M92 178l16 12M104 168l14 14" stroke={accent} strokeWidth="4" strokeLinecap="round" />
            {silhouette === 'trail' && (
              <>
                <path d="M70 220h96" stroke={secondary} strokeWidth="5" strokeDasharray="3 5" />
                <path d="M118 182l14 10" stroke={palette.secondary} strokeWidth="3" />
              </>
            )}
          </g>
        )
      }
      if (silhouette === 'sandal') {
        return (
          <g>
            <path d="M68 190h104c10 0 12 8 4 14H64c-8-4-6-14 4-14Z" fill={secondary} {...line} />
            <path d="M84 190c0-18 12-30 30-30s24 12 24 30" fill="none" stroke={primary} strokeWidth="8" strokeLinecap="round" />
            <path d="M124 190c2-14 10-22 20-22" fill="none" stroke={primary} strokeWidth="7" strokeLinecap="round" />
            <path d="M72 204h96" stroke={outline} strokeOpacity="0.35" strokeWidth="2" />
          </g>
        )
      }
      if (silhouette === 'boot') {
        return (
          <g>
            <path d="M88 96h44v78c0 12 8 18 20 22 8 2 10 10 2 14H78c-8 0-10-8-6-16 14-14 16-30 16-44V96Z" fill={primary} {...line} />
            <path d="M88 118h44" stroke={palette.detail} strokeWidth="2" strokeOpacity="0.5" />
            <path d="M74 208h92" stroke={outline} strokeWidth="3" strokeLinecap="round" />
            <path d="M98 108v52" stroke={palette.highlight} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M118 104c6 6 6 14 0 20" stroke={secondary} strokeWidth="3" fill="none" />
          </g>
        )
      }
      if (silhouette === 'flat') {
        return (
          <g>
            <path d="M68 194c26 2 44-4 56-18 8-10 18-10 24-2l14 22c6 10-2 16-12 16H76c-10 0-14-8-8-18Z" fill={primary} {...line} />
            <path d="M64 212h100" stroke={outline} strokeWidth="2.6" strokeLinecap="round" />
            <path d="M96 188c10 6 24 6 34-2" stroke={accent} strokeWidth="2.4" fill="none" />
          </g>
        )
      }
      if (silhouette === 'khussa') {
        return (
          <g>
            <path d="M62 198c30 4 58-2 76-20 10-10 22-8 26 4l4 22c2 10-6 16-18 16H70c-12 0-16-8-8-22Z" fill={primary} {...line} />
            <path d="M138 182c-8 16-24 26-52 30" stroke={palette.accent} strokeWidth="3.2" fill="none" strokeLinecap="round" />
            {[0, 1, 2, 3].map((index) => (
              <circle key={index} cx={100 + index * 12} cy={196 + index * 3} r="2.2" fill={palette.accent} />
            ))}
            <path d="M64 212h102" stroke={outline} strokeWidth="3" strokeLinecap="round" />
          </g>
        )
      }
      return (
        <g>
          <path d="M68 192c22 4 42-2 56-14 8-8 18-8 22 0l10 22c4 8-2 14-12 14H76c-10 0-14-8-8-22Z" fill={primary} {...line} />
          <path d="M66 208h96" stroke={outline} strokeWidth="3" strokeLinecap="round" />
          <path d="M98 178l10 10M110 170l12 12" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        </g>
      )
    }

    // -------------------------------------------------------------------- bag
    if (slot === 'bag') {
      if (silhouette === 'handbag') {
        return (
          <g>
            <path d="M80 128h80l10 112H70l10-112Z" fill={primary} {...line} />
            <path d="M100 128V108c0-12 9-20 20-20s20 8 20 20v20" fill="none" stroke={secondary} strokeWidth="5" strokeLinecap="round" />
            <path d="M150 138h14c8 0 12 6 12 12v26" stroke={secondary} strokeWidth="4" fill="none" strokeLinecap="round" />
            <rect x="112" y="160" width="16" height="14" rx="1" fill={accent} {...line} />
            <path d="M70 178h100" stroke={palette.detail} strokeWidth="1.6" strokeOpacity="0.5" />
          </g>
        )
      }
      return (
        <g>
          <path d="M76 128h88l8 112H68l8-112Z" fill={primary} {...line} />
          <path d="M96 128V104c0-14 10-24 24-24s24 10 24 24v24" fill="none" stroke={secondary} strokeWidth="6" strokeLinecap="round" />
          <path d="M68 168h104" stroke={palette.detail} strokeWidth="2" />
          <rect x="112" y="160" width="16" height="16" rx="1" fill={accent} {...line} />
        </g>
      )
    }

    // ------------------------------------------------------------------ watch
    if (slot === 'watch') {
      return (
        <g>
          <rect x="112" y="52" width="16" height="76" rx="6" fill={secondary} {...line} />
          <rect x="112" y="196" width="16" height="72" rx="6" fill={secondary} {...line} />
          <circle cx="120" cy="162" r="44" fill={primary} {...line} />
          <circle cx="120" cy="162" r="34" fill={accent} fillOpacity="0.22" stroke={outline} strokeOpacity="0.2" />
          <path d="M120 162v-22M120 162l16 10" stroke={outline} strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
          <rect x="155" y="158" width="7" height="9" rx="1" fill={accent} />
        </g>
      )
    }

    // ------------------------------------------------------------- accessories
    if (slot === 'accessory') {
      if (silhouette === 'belt') {
        return (
          <g>
            <path d="M52 136h100v28H52z" fill={primary} {...line} />
            <path d="M152 130h30v40h-30z" fill={secondary} {...line} />
            <rect x="160" y="140" width="14" height="20" rx="2" fill={palette.accent} {...line} />
            <path d="M60 142h88M60 158h88" stroke={palette.detail} strokeWidth="1.2" strokeDasharray="4 4" strokeOpacity="0.7" />
            <circle cx="80" cy="150" r="3" fill={outline} fillOpacity="0.4" />
            <circle cx="100" cy="150" r="3" fill={outline} fillOpacity="0.4" />
            <circle cx="120" cy="150" r="3" fill={outline} fillOpacity="0.4" />
          </g>
        )
      }
      if (silhouette === 'sunglasses') {
        return (
          <g>
            <path d="M56 136h50c6 0 8 4 8 10v14c0 14-10 22-26 22s-26-8-26-22v-14c0-6 2-10 8-10Z" fill={primary} {...line} />
            <path d="M134 136h50c6 0 8 4 8 10v14c0 14-10 22-26 22s-26-8-26-22v-14c0-6 2-10 8-10Z" fill={primary} {...line} />
            <path d="M106 150h28" stroke={secondary} strokeWidth="5" strokeLinecap="round" />
            <path d="M62 146h40M140 146h40" stroke={accent} strokeWidth="2.4" strokeOpacity="0.6" />
            <path d="M60 140h42M138 140h42" stroke="white" strokeOpacity="0.28" strokeWidth="3" strokeLinecap="round" />
          </g>
        )
      }
      if (silhouette === 'jewellery') {
        return (
          <g>
            <path d="M66 84c14 44 34 76 54 96 20-20 40-52 54-96" fill="none" stroke={primary} strokeWidth="5" strokeLinecap="round" />
            <path d="M66 84c14 44 34 76 54 96 20-20 40-52 54-96" fill="none" stroke={secondary} strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.8" />
            {[0, 1, 2, 3, 4, 5].map((index) => {
              const x = 78 + index * 17
              const y = 100 + Math.sin(index / 2.4) * 26
              return <circle key={index} cx={x} cy={y} r="4.4" fill={accent} {...line} />
            })}
            <path d="M120 184l10 14-10 22-10-22 10-14Z" fill={accent} {...line} />
            <circle cx="120" cy="82" r="7" fill={primary} {...line} />
          </g>
        )
      }
      return (
        <g>
          <path d="M74 120c28 18 64 18 92 0 10-6 18 4 12 14-30 22-86 22-116 0-6-10 2-20 12-14Z" fill={primary} {...line} />
          <path d="M108 140l-8 96h22l-6-96Z" fill={secondary} {...line} />
          <path d="M74 120c28 18 64 18 92 0" fill="none" stroke={accent} strokeWidth="2.4" strokeOpacity="0.7" />
        </g>
      )
    }

    if (slot === 'headwear') {
      if (silhouette === 'cap') {
        return (
          <g>
            <path d="M64 176c0-40 26-64 56-64s56 24 56 64H64Z" fill={primary} {...line} />
            <path d="M64 176h112c16 0 22 8 16 16H80c-14 0-20-8-16-16Z" fill={secondary} {...line} />
            <path d="M120 112v64" stroke={palette.detail} strokeWidth="1.6" strokeOpacity="0.45" />
            <circle cx="120" cy="112" r="4" fill={accent} {...line} />
          </g>
        )
      }
      return (
        <g>
          <path d="M68 176c0-38 24-62 52-62s52 24 52 62h-24c0-24-12-38-28-38s-28 14-28 38H68Z" fill={primary} {...line} />
          <path d="M64 176h112v10H64z" fill={secondary} {...line} />
        </g>
      )
    }

    // --------------------------------------------------------------- tops etc.
    if (silhouette === 'kurti') {
      return (
        <g>
          <path d="M96 58h48l16 20-6 30-8-2v76H94v-76l-8 2-6-30 16-20Z" fill={primary} {...line} />
          <path d="M108 58h24v14h-24z" fill={accent} {...line} />
          <path d="M94 158h52" stroke={secondary} strokeWidth="3.4" />
          <path d="M120 74v84" stroke={palette.detail} strokeWidth="1.4" strokeOpacity="0.5" />
          <path d="M94 176h52v6H94z" fill={secondary} {...line} opacity="0.9" />
        </g>
      )
    }
    if (silhouette === 'hoodie') {
      return (
        <g>
          <path d="M92 86 120 74l28 12 30 22-10 34-14-8v108H86V134l-14 8-10-34 30-22Z" fill={primary} {...line} />
          <path d="M104 74c0-18 8-28 16-28s16 10 16 28c-8 8-24 8-32 0Z" fill={secondary} {...line} />
          <path d="M112 84v18M128 84v18" stroke={palette.accent} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M100 196h40v20h-40z" fill={secondary} {...line} opacity="0.9" />
          <path d="M86 240h68" stroke={palette.secondary} strokeWidth="6" />
        </g>
      )
    }
    if (silhouette === 'tshirt') {
      return (
        <g>
          <path d="M92 80 120 70l28 10 26 18-8 26-14-6v112H88V118l-14 6-8-26 26-18Z" fill={primary} {...line} />
          <path d="M108 70c4 12 8 16 12 16s8-4 12-16" fill="none" stroke={secondary} strokeWidth="3.2" />
          <path d="M88 118l-14 6-8-26 26-18" fill={palette.highlight} fillOpacity="0.25" />
          <path d="M122 96h36" stroke={palette.detail} strokeWidth="1.6" strokeOpacity="0.35" />
        </g>
      )
    }
    if (silhouette === 'active') {
      return (
        <g>
          <path d="M94 84 120 74l26 10 24 16-8 24-12-6v98H90V118l-12 6-8-24 24-16Z" fill={primary} {...line} />
          <path d="M108 74l12 12 12-12" fill="none" stroke={palette.accent} strokeWidth="3" />
          <path d="M90 150h60M90 170h60" stroke={palette.secondary} strokeWidth="4" strokeOpacity="0.75" />
          <path d="M120 86v104" stroke={palette.detail} strokeWidth="1.4" strokeOpacity="0.35" />
        </g>
      )
    }
    if (silhouette === 'waistcoat') {
      return (
        <g>
          <path d="M92 76 120 68l28 8 12 12-6 26-10-2 4 96H92l4-96-10 2-6-26 12-12Z" fill={primary} {...line} />
          <path d="M120 68v140" stroke={palette.detail} strokeWidth="2" strokeOpacity="0.6" />
          <path d="M108 68l12 18 12-18" fill={secondary} {...line} />
          {[110, 130, 150, 170].map((y) => (
            <circle key={y} cx="120" cy={y} r="2.4" fill={palette.accent} />
          ))}
          <path d="M94 60h52" stroke={palette.secondary} strokeWidth="3" strokeOpacity="0.7" />
        </g>
      )
    }
    if (silhouette === 'camisole') {
      return (
        <g>
          <path d="M98 96h44l8 126h-60l8-126Z" fill={primary} {...line} />
          <path d="M104 96l6-24M136 96l-6-24" stroke={secondary} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M104 96c6 10 26 10 32 0" fill="none" stroke={accent} strokeWidth="2.6" />
          <path d="M120 106v110" stroke={palette.detail} strokeWidth="1.4" strokeOpacity="0.4" />
        </g>
      )
    }

    const long = ['trench', 'overcoat', 'coat', 'puffer'].includes(silhouette)
    const hem = long ? 262 : slot === 'outerwear' ? 246 : 228
    const tailcoat = ['blazer', 'suit', 'trench', 'overcoat', 'chore', 'field', 'bomber', 'puffer'].includes(silhouette)
    return (
      <g>
        <path
          d={`M94 74 120 66l26 8 30 20-10 34-14-8v${hem - 120}h-64V${120}l-14 8-10-34 30-20Z`}
          fill={primary}
          {...line}
        />
        <path d="M94 74 120 66l26 8-26 30-26-30Z" fill={accent} {...line} />
        {tailcoat && (
          <>
            <path d={`M120 104 L136 74 L152 94 L132 ${hem - 12} H120 V104Z`} fill={secondary} {...line} />
            <path d={`M120 104 L104 74 L88 94 L108 ${hem - 12} H120 V104Z`} fill={shade(primary, -8)} {...line} />
            <path d="M120 120v110" stroke={outline} strokeOpacity="0.22" strokeWidth="1.6" />
            {long && <path d="M88 176h64" stroke={secondary} strokeWidth="5" strokeOpacity="0.85" />}
          </>
        )}
        {silhouette === 'shirt' && (
          <>
            <path d="M120 96v120" stroke={palette.detail} strokeWidth="2" />
            {[132, 156, 180, 204].map((y) => (
              <circle key={y} cx="120" cy={y} r="2.4" fill={outline} fillOpacity="0.5" />
            ))}
          </>
        )}
        {silhouette === 'knit' && (
          <path d="M104 96c8 10 24 10 32 0" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />
        )}
        {silhouette === 'puffer' && (
          <>
            {[116, 148, 180, 212].map((y) => (
              <path key={y} d={`M86 ${y}h68`} stroke={outline} strokeOpacity="0.2" strokeWidth="2" />
            ))}
            <path d="M94 74h52" stroke={secondary} strokeWidth="6" strokeOpacity="0.85" />
          </>
        )}
        {silhouette === 'field' && (
          <>
            <rect x="88" y="148" width="24" height="22" rx="1.5" fill={secondary} {...line} />
            <rect x="128" y="148" width="24" height="22" rx="1.5" fill={secondary} {...line} />
            <path d="M88 190h64" stroke={secondary} strokeWidth="4" strokeOpacity="0.7" />
          </>
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
