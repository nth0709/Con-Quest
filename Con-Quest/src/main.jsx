import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}
import App from './App.jsx'
import { AppDataProvider } from './context/AppDataProvider'
import { AppDialogProvider } from './context/AppDialogProvider'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppDialogProvider>
      <AppDataProvider>
        <App />
      </AppDataProvider>
    </AppDialogProvider>
  </StrictMode>,
)
