import React, { Suspense, lazy, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter/opsz.css'
import './styles.css'
import App from './App'
import { Store } from './store'
import { listenForInstall } from './install'

listenForInstall()
// Offline shell and cached proving files. Only in a real build, so local development always gets fresh code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* optional */ }) })

// The admin dashboard is unlisted (#/admin), loads separately, and only opens after an admin wallet signs in.
const Admin = lazy(() => import('./pages/AdminGate'))
const isAdmin = () => location.hash.split('?')[0] === '#/admin'

// The Oculus (the HELL burn window) lives on its own subdomain, oculus.hagitrade.xyz. #/oculus opens it anywhere.
const Hell = lazy(() => import('./pages/Oculus'))
const isHell = () => /^(oculus|hellwindow)\./.test(location.hostname) || ['#/oculus', '#/hell'].includes(location.hash.split('?')[0])

function Root() {
  const [admin, setAdmin] = useState(isAdmin)
  const [hell, setHell] = useState(isHell)
  useEffect(() => { const f = () => { setAdmin(isAdmin()); setHell(isHell()) }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  if (hell) return <Suspense fallback={null}><Hell /></Suspense>
  return admin ? <Suspense fallback={null}><Admin /></Suspense> : <Store><App /></Store>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>)
