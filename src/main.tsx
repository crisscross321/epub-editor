import './polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('root missing')

const app = <App />
createRoot(root).render(import.meta.env.DEV ? <StrictMode>{app}</StrictMode> : app)

void import('@capacitor/status-bar')
  .then(({ StatusBar, Style }) =>
    Promise.all([
      StatusBar.setStyle({ style: Style.Dark }),
      StatusBar.setBackgroundColor({ color: '#efe6d4' }).catch(() => undefined),
    ]),
  )
  .catch(() => undefined)
