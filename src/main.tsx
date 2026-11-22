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

// The admin dashboard is unlisted (#/admin) and loads separately, so it adds nothing to the app's own bundle.
const Admin = lazy(() => import('./pages/Admin'))
const isAdmin = () => location.hash.split('?')[0] === '#/admin'

function Root() {
  const [admin, setAdmin] = useState(isAdmin)
  useEffect(() => { const f = () => setAdmin(isAdmin()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  return admin ? <Suspense fallback={null}><Admin /></Suspense> : <Store><App /></Store>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>)
