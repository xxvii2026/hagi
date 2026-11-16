import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter/opsz.css'
import './styles.css'
import App from './App'
import { Store } from './store'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Store><App /></Store></React.StrictMode>)
