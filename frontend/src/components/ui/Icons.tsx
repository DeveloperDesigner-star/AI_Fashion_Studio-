import type { ReactNode, SVGProps } from 'react'
import { cn } from '@/lib/format'

/**
 * Original 24×24 stroke icon set for AI Fashion Studio.
 *
 * Drawn for this project rather than pulled from an icon package: the brief
 * forbids decorative filler and an external set would add a runtime dependency
 * for sixteen glyphs. Every icon is a single path family on a 1.6px stroke so
 * they sit at the same optical weight next to the Inter type.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 20, className, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
      {...rest}
    >
      {children}
    </svg>
  )
}

export function IconGrid(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
    </Icon>
  )
}

export function IconShirt(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 3.5 4.2 5.8a2 2 0 0 0-1.1 1.9l.4 3.6 2.6-.5v9.4a1 1 0 0 0 1 1h9.8a1 1 0 0 0 1-1v-9.4l2.6.5.4-3.6a2 2 0 0 0-1.1-1.9L15 3.5" />
      <path d="M9 3.5a3 3 0 0 0 6 0" />
    </Icon>
  )
}

export function IconLayers(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3 8.5 4.6L12 12.2 3.5 7.6 12 3Z" />
      <path d="m3.5 12.4 8.5 4.6 8.5-4.6" />
      <path d="m3.5 16.9 8.5 4.6 8.5-4.6" />
    </Icon>
  )
}

export function IconBag(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 8h15l-1.1 11.2a1.6 1.6 0 0 1-1.6 1.4H7.2a1.6 1.6 0 0 1-1.6-1.4L4.5 8Z" />
      <path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" />
    </Icon>
  )
}

export function IconPalette(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21a9 9 0 1 1 9-9c0 2.2-1.8 3.4-3.6 3.4h-1.2a2 2 0 0 0-1.5 3.3A1.9 1.9 0 0 1 12 21Z" />
      <circle cx="7.8" cy="12" r="1.1" />
      <circle cx="10" cy="7.8" r="1.1" />
      <circle cx="15" cy="8.4" r="1.1" />
    </Icon>
  )
}

export function IconSparkle(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8L4.5 10.7 10.3 9 12 3.2Z" />
      <path d="M18.6 16.4l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
    </Icon>
  )
}

export function IconSettings(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </Icon>
  )
}

export function IconUser(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20.2a7 7 0 0 1 14 0" />
    </Icon>
  )
}

export function IconArrowRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </Icon>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function IconUpload(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 16V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </Icon>
  )
}

export function IconEye(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </Icon>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.8 4.4 4.4L19 6.8" />
    </Icon>
  )
}

export function IconClock(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.4V12l3.2 2" />
    </Icon>
  )
}

export function IconPackage(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2L12 3Z" />
      <path d="M4.3 7.4 12 11.7l7.7-4.3" />
      <path d="M12 11.7V21" />
    </Icon>
  )
}

export function IconTruck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.8 6.5h10.4v10.2H2.8z" />
      <path d="M13.2 10.2h4l3.2 3.2v3.3h-7.2" />
      <circle cx="7" cy="18.4" r="1.7" />
      <circle cx="17" cy="18.4" r="1.7" />
    </Icon>
  )
}

export function IconImage(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.2" y="4.6" width="17.6" height="14.8" rx="2" />
      <circle cx="8.6" cy="9.6" r="1.5" />
      <path d="m3.8 17 4.9-4.9 3.5 3.5 3-3L20.4 18" />
    </Icon>
  )
}

export function IconType(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 6.4V4.6h15v1.8" />
      <path d="M12 4.6V19.4" />
      <path d="M8.6 19.4h6.8" />
    </Icon>
  )
}

export function IconRuler(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3.2 15.3 12-12 5.6 5.6-12 12-5.6-5.6Z" />
      <path d="m7.4 11.1 1.9 1.9M10.2 8.3l1.9 1.9M13 5.5l1.9 1.9" />
    </Icon>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.6" />
      <path d="m16 16 4.4 4.4" />
    </Icon>
  )
}

export function IconStore(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.4 9.6V20h15.2V9.6" />
      <path d="M3.4 9.6 5.2 4.4h13.6l1.8 5.2Z" />
      <path d="M9.8 20v-5.2h4.4V20" />
    </Icon>
  )
}

export function IconInfo(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.4" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function IconChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </Icon>
  )
}
