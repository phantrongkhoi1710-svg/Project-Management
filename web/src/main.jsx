import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { checkDeployVersion } from './lib/checkDeployVersion.js'

async function boot() {
  await checkDeployVersion()
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

boot()
