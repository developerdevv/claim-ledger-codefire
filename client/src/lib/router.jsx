import { useEffect, useState } from 'react'

/**
 * Minimal hash router — no routing library, per project constraints.
 * Routes look like:  #/review   #/review?draft=D-2   #/impact   #/vault   #/history
 */

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const qIndex = raw.indexOf('?')
  const path = (qIndex === -1 ? raw : raw.slice(0, qIndex)) || '/'
  const params = Object.fromEntries(
    new URLSearchParams(qIndex === -1 ? '' : raw.slice(qIndex + 1)),
  )
  return { path, params }
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash)

  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

export function navigate(to, { replace = false } = {}) {
  const target = `#${to.startsWith('/') ? to : `/${to}`}`
  if (window.location.hash === target) return
  if (replace) {
    window.history.replaceState(null, '', target)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = target
  }
}

export function Link({ to, children, ...rest }) {
  return (
    <a href={`#${to.startsWith('/') ? to : `/${to}`}`} {...rest}>
      {children}
    </a>
  )
}
