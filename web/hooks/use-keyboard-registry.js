"use client"

import { useEffect, useRef, useCallback } from 'react'

/**
 * Priority-based keyboard shortcut dispatcher.
 * Layers: modal (highest) > cart > global (lowest)
 *
 * Usage:
 *   const { registerShortcut } = useKeyboardRegistry()
 *   useEffect(() => registerShortcut('global', { key: 'F5' }, handlePayment), [])
 */
export function useKeyboardRegistry() {
  const handlers = useRef({ modal: [], cart: [], global: [] })

  useEffect(() => {
    function handleKeyDown(e) {
      // Priority: modal > cart > global
      for (const layer of ['modal', 'cart', 'global']) {
        for (const { keyCombo, handler } of handlers.current[layer]) {
          if (matchesCombo(e, keyCombo)) {
            e.preventDefault()
            e.stopPropagation()
            handler(e)
            return
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const registerShortcut = useCallback((layer, keyCombo, handler) => {
    const entry = { keyCombo, handler }
    handlers.current[layer] = [...handlers.current[layer], entry]
    // Return cleanup function
    return () => {
      handlers.current[layer] = handlers.current[layer].filter(h => h !== entry)
    }
  }, [])

  return { registerShortcut }
}

function matchesCombo(event, combo) {
  if (event.key !== combo.key) return false
  if (combo.ctrl  !== undefined && event.ctrlKey  !== combo.ctrl)  return false
  if (combo.shift !== undefined && event.shiftKey !== combo.shift) return false
  if (combo.alt   !== undefined && event.altKey   !== combo.alt)   return false
  return true
}
