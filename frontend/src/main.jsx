import { config } from '@fortawesome/fontawesome-svg-core'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

config.autoAddCss = false

// Capture OAuth token before React Router can navigate away from the query string.
const oauthParams = new URLSearchParams(window.location.search)
const oauthToken = oauthParams.get('auth_token')
if (oauthToken) {
  localStorage.setItem('auth_token', oauthToken)
  window.history.replaceState({}, '', window.location.pathname)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
