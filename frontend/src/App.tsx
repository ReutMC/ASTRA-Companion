/**
 * ASTRA renderer entry. One Vite app, two layouts:
 *   ?mode=companion → transparent frameless orb UI
 *   ?mode=app       → full control-panel window (default)
 */
import { useEffect } from 'react'
import { isMock } from './lib/astra'
import CompanionMode from './modes/Companion'
import AppMode from './modes/AppMode'

function readMode(): 'companion' | 'app' {
  if (typeof location === 'undefined') return 'app'
  return new URLSearchParams(location.search).get('mode') === 'companion' ? 'companion' : 'app'
}

export default function App() {
  const mode = readMode()

  useEffect(() => {
    const root = document.documentElement
    if (mode === 'companion') {
      root.classList.add('companion')
    } else {
      root.classList.remove('companion')
    }
    return () => root.classList.remove('companion')
  }, [mode])

  useEffect(() => {
    if (isMock()) {
      console.info('[ASTRA] running with mock bridge — launch via the desktop shell for live IPC')
    }
  }, [])

  return mode === 'companion' ? <CompanionMode /> : <AppMode />
}
