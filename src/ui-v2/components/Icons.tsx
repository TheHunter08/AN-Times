// Iconos SVG de línea, coherentes en tamaño/grosor — sustituyen a los
// símbolos unicode usados como placeholder ("◧ ◷ ▦ ◎ ⚙"), que es una de
// las razones por las que la UI se sentía anticuada.
import type { SVGProps } from 'react'

const base = (props: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: 18,
  height: 18,
  ...props,
})

export function IconGrid(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}
export function IconClock(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" />
    </svg>
  )
}
export function IconCalendar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="16" rx="2" /><line x1="16" y1="3" x2="16" y2="7" />
      <line x1="8" y1="3" x2="8" y2="7" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
export function IconChart(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <line x1="4" y1="20" x2="20" y2="20" /><rect x="6" y="12" width="3" height="8" rx="1" />
      <rect x="10.5" y="7" width="3" height="13" rx="1" /><rect x="15" y="10" width="3" height="10" rx="1" />
    </svg>
  )
}
export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
export function IconUsers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
export function IconBell(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
export function IconLogout(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}
export function IconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  )
}
export function IconArrowLeft(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><polyline points="15 18 9 12 15 6" /></svg>
}
export function IconArrowRight(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><polyline points="9 18 15 12 9 6" /></svg>
}
export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
export function IconChevronDown(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><polyline points="6 9 12 15 18 9" /></svg>
}
export function IconPlay(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)} fill="currentColor" stroke="none"><path d="M8 5v14l11-7z" /></svg>
}
export function IconPause(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)} fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
}
export function IconStop(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)} fill="currentColor" stroke="none"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
}
export function IconChat(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
}
export function IconCheck(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><polyline points="20 6 9 17 4 12" /></svg>
}
export function IconX(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
}
export function IconRefresh(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
}
export function IconDownload(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
}
export function IconPlus(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
}
export function IconWifiOff(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><line x1="2" y1="2" x2="22" y2="22" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M5 12.5a10 10 0 0 1 3-2.1M19 12.5a10 10 0 0 0-2.3-1.9M9 8.8a10 10 0 0 1 7.2.6" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>
}
export function IconDevice(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><rect x="7" y="2" width="10" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" /></svg>
}
export function IconSync(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
}
export function IconDots(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)} fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
}
export function IconFolder(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></svg>
}
export function IconFileText(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></svg>
}
export function IconClipboard(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /></svg>
}
export function IconAlertCircle(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
}
export function IconMapPin(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M21 10c0 6.5-9 12-9 12s-9-5.5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
}
export function IconSend(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
}
export function IconShield(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M12 2l9 4v5c0 5.5-3.8 10.7-9 12C6.8 21.7 3 16.5 3 11V6l9-4z" /></svg>
}
export function IconBuilding(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><rect x="3" y="9" width="18" height="12" rx="1" /><path d="M3 9l9-7 9 7" /><line x1="9" y1="21" x2="9" y2="14" /><line x1="15" y1="21" x2="15" y2="14" /><line x1="12" y1="21" x2="12" y2="14" /></svg>
}
export function IconFilter(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
}
export function IconLock(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
}
export function IconEye(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
}
export function IconEyeOff(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
}
export function IconTrendUp(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
}
export function IconReceipt(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" /><line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="14" y2="13" /></svg>
}
export function IconStar(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
}
export function IconMail(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22 6 12 13 2 6" /></svg>
}
export function IconHardHat(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M2 18h20v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2z" /><path d="M12 3a9 9 0 0 1 9 9v6H3v-6a9 9 0 0 1 9-9z" /><line x1="3.5" y1="12" x2="20.5" y2="12" /></svg>
}
export function IconRows(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><rect x="3" y="5" width="18" height="4" rx="1" /><rect x="3" y="11" width="18" height="4" rx="1" /><rect x="3" y="17" width="18" height="4" rx="1" /></svg>
}
export function IconSeal(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M12 2l2.4 4.8 5.3.8-3.85 3.75.91 5.3L12 14l-4.76 2.65.91-5.3L4.3 7.6l5.3-.8L12 2z" /><polyline points="9 12 11 14 15 10" /></svg>
}
export function IconTrendDown(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>
}
export function IconEdit(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
}
export function IconUserPlus(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></svg>
}
export function IconHome(props: SVGProps<SVGSVGElement>) {
  return <svg {...base(props)}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
}
