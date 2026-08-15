import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('root missing')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void import('@capacitor/status-bar')
  .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: Style.Light }))
  .catch(() => undefined)
