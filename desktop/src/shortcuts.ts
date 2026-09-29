/**
 * ASTRA desktop — global shortcuts.
 * Registers settings.shortcuts.toggle (default Ctrl+Space) via Electron
 * globalShortcut; can be re-registered when the accelerator setting changes.
 */
import { globalShortcut } from 'electron'
import type { Settings } from './types'

export interface ShortcutsHandle {
  reregister(settings: Settings): void
  unregister(): void
}

export function registerShortcuts(
  settings: Settings,
  onActivate: () => void,
): ShortcutsHandle {
  let registeredAccelerator = ''

  const register = (accelerator: string): void => {
    if (!accelerator || accelerator === registeredAccelerator) return
    try {
      const ok = globalShortcut.register(accelerator, onActivate)
      if (ok) {
        if (registeredAccelerator) globalShortcut.unregister(registeredAccelerator)
        registeredAccelerator = accelerator
      } else {
        console.warn(`[astra] global shortcut "${accelerator}" is already taken by another app`)
      }
    } catch (err) {
      console.error(`[astra] failed to register shortcut "${accelerator}":`, err)
    }
  }

  register(settings.shortcuts.toggle)

  return {
    reregister(next: Settings): void {
      if (next.shortcuts.toggle === registeredAccelerator) return
      register(next.shortcuts.toggle)
    },
    unregister(): void {
      if (registeredAccelerator) {
        try {
          globalShortcut.unregister(registeredAccelerator)
        } catch {
          // already gone
        }
        registeredAccelerator = ''
      }
    },
  }
}

export function unregisterAllShortcuts(): void {
  try {
    globalShortcut.unregisterAll()
  } catch {
    // noop
  }
}
