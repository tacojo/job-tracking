import { config } from '@fortawesome/fontawesome-svg-core'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

config.autoAddCss = false

// Old OAuth redirects used auth_token in the URL. Strip it without trusting it.
if (new URLSearchParams(window.location.search).has('auth_token')) {
  window.history.replaceState({}, '', window.location.pathname)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
