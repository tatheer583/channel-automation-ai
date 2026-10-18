/**
 * Minimal hash-based client router.
 *
 * Hash routing is used on purpose: the app deploys to a repository-based
 * GitHub Pages URL (e.g. /<repo>/), where path-based routing would 404 on
 * refresh and require extra config. Hash URLs work everywhere, reload-free.
 */

import { useEffect, useState, type AnchorHTMLAttributes } from 'react'

export const ROUTES = [
  '/overview',
  '/channels',
  '/library',
  '/studio',
  '/captions',
  '/calendar',
  '/settings',
] as const

export type Route = (typeof ROUTES)[number]

function normalize(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '') || '/overview'
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : '/overview'
}

/** Subscribe to the current hash route. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => normalize(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(normalize(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

/** Programmatic navigation (never reloads the document). */
export function navigate(to: Route): void {
  if (normalize(window.location.hash) === to) return
  window.location.hash = to
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: Route
  /** Render an aria-current="page" when this link is active. */
  active?: boolean
}

/** Anchor-based route link; native hash navigation, no reload. */
export function Link({ to, active, children, ...rest }: LinkProps) {
  return (
    <a href={`#${to}`} aria-current={active ? 'page' : undefined} {...rest}>
      {children}
    </a>
  )
}
