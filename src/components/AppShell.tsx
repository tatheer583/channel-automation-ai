/**
 * Application shell: brand rail (sidebar), topbar, mobile drawer and
 * the routed content area. Hash routing keeps navigation reload-free.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CalendarDays,
  Captions,
  Clapperboard,
  Film,
  HardDrive,
  LayoutDashboard,
  Menu,
  Scissors,
  Settings,
  Video,
  X,
} from 'lucide-react'
import { Link, navigate, type Route } from '../lib/router'
import { cx, Toaster } from './ui'

export const NAV_ITEMS: { route: Route; label: string; description: string; icon: ReactNode }[] = [
  {
    route: '/overview',
    label: 'Overview',
    description: 'Project statistics and recent activity',
    icon: <LayoutDashboard size={18} aria-hidden="true" />,
  },
  {
    route: '/channels',
    label: 'Channels',
    description: 'Save and manage demo channel links',
    icon: <Video size={18} aria-hidden="true" />,
  },
  {
    route: '/library',
    label: 'Video Library',
    description: 'Local video uploads and previews',
    icon: <Film size={18} aria-hidden="true" />,
  },
  {
    route: '/studio',
    label: 'Clip Studio',
    description: 'Plan clips with timestamps and ratios',
    icon: <Scissors size={18} aria-hidden="true" />,
  },
  {
    route: '/captions',
    label: 'Captions & Templates',
    description: 'Caption styles and video formats',
    icon: <Captions size={18} aria-hidden="true" />,
  },
  {
    route: '/calendar',
    label: 'Content Calendar',
    description: 'Schedule demo posts day by day',
    icon: <CalendarDays size={18} aria-hidden="true" />,
  },
  {
    route: '/settings',
    label: 'Settings',
    description: 'Preferences, data management, about',
    icon: <Settings size={18} aria-hidden="true" />,
  },
]

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="ChannelAI logo" className="brand-mark">
      <defs>
        <linearGradient id="brand-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b7bff" />
          <stop offset="1" stopColor="#4f8dff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill="url(#brand-g)" />
      <path d="M25 20.5 47 32 25 43.5Z" fill="#ffffff" />
      <rect x="20" y="47.5" width="24" height="3.5" rx="1.75" fill="#ffffff" opacity="0.55" />
    </svg>
  )
}

function SidebarContent({ route, onNavigate }: { route: Route; onNavigate?: () => void }) {
  return (
    <>
      <div className="sidebar__brand">
        <BrandMark />
        <span className="sidebar__brand-text">
          ChannelAI
          <small>Automation workspace</small>
        </span>
      </div>
      <nav className="sidebar__nav" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.route}
            to={item.route}
            className={cx('nav-link', route === item.route && 'is-active')}
            onClick={onNavigate}
          >
            {item.icon}
            <span className="nav-link__label">{item.label}</span>
            {route === item.route && <span className="nav-link__dot" aria-hidden="true" />}
          </Link>
        ))}
      </nav>
      <div className="sidebar__meta">
        <div className="sidebar__meta-chip">
          <HardDrive size={14} aria-hidden="true" />
          <span>Local demo · data stays in this browser</span>
        </div>
        <span className="sidebar__version">ChannelAI v0.1.0</span>
      </div>
    </>
  )
}

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const current = NAV_ITEMS.find((item) => item.route === route) ?? NAV_ITEMS[0]

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false)
  }, [route])

  // Esc closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  // Scroll to top on navigation.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [route])

  const goOverview = () => {
    navigate('/overview')
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside className={cx('sidebar', drawerOpen && 'is-open')} aria-label="Sidebar" id="sidebar">
        <SidebarContent route={route} />
        <button
          type="button"
          className="btn-icon sidebar__close"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </aside>
      {drawerOpen && <div className="backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      <div className="shell__main">
        <header className="topbar">
          <button
            type="button"
            className="btn-icon topbar__menu"
            aria-label={drawerOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={drawerOpen}
            aria-controls="sidebar"
            onClick={() => setDrawerOpen((open) => !open)}
          >
            {drawerOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          </button>
          <button type="button" className="topbar__brand" onClick={goOverview}>
            <BrandMark size={22} />
            <span>ChannelAI</span>
          </button>
          <div className="topbar__titles">
            <h1 className="topbar__title">{current.label}</h1>
            <span className="topbar__desc">{current.description}</span>
          </div>
          <span className="topbar__chip">
            <Clapperboard size={13} aria-hidden="true" />
            Demo workspace
          </span>
        </header>

        <main className="content" id="main-content" ref={mainRef} tabIndex={-1}>
          {children}
        </main>
      </div>

      <Toaster />
    </div>
  )
}
