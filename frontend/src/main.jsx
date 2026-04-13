import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import 'remixicon/fonts/remixicon.css'

const THEME_KEY = 'intermidia_theme';
const THEME_MIGRATION_KEY = 'intermidia_theme_default_migration_v1';

try {
  const migrationDone = localStorage.getItem(THEME_MIGRATION_KEY) === '1';
  if (!migrationDone) {
    localStorage.setItem(THEME_KEY, 'light');
    localStorage.setItem(THEME_MIGRATION_KEY, '1');
  }
} catch {
  // Ignore localStorage access failures (private mode / blocked storage).
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
