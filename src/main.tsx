import './polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { applyTheme, loadSettings, resolveTheme } from './storage/settings'

const settings = loadSettings()
applyTheme(resolveTheme(settings.theme, window.matchMedia('(prefers-color-scheme: dark)').matches))

const root = document.getElementById('root')
if (!root) throw new Error('root missing')

const app = <App />
createRoot(root).render(import.meta.env.DEV ? <StrictMode>{app}</StrictMode> : app)
