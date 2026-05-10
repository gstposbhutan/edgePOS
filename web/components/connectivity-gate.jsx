"use client"

import { useEffect, useState } from "react"
import { WifiOff, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Hard-blocks the entire UI when the device goes offline.
 * Wraps children — renders them only when online.
 * Retries connection every 5 seconds automatically.
 */
export function ConnectivityGate({ children }) {
  const [online, setOnline] = useState(true)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    // Set initial state
    setOnline(navigator.onLine)

    const handleOnline  = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Auto-retry every 5 seconds while offline
  useEffect(() => {
    if (online) return
    const interval = setInterval(() => {
      setOnline(navigator.onLine)
    }, 5000)
    return () => clearInterval(interval)
  }, [online])

  async function handleRetry() {
    setChecking(true)
    // Attempt a lightweight fetch to confirm real connectivity
    try {
      await fetch('/api/ping', { method: 'HEAD', cache: 'no-store' })
      setOnline(true)
    } catch {
      setOnline(navigator.onLine)
    } finally {
      setChecking(false)
    }
  }

  if (online) return children

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background">
      <div className="glassmorphism border border-border rounded-2xl p-10 max-w-sm w-full mx-4 flex flex-col items-center gap-6 text-center">
        {/* Icon */}
        <div className="h-20 w-20 rounded-full bg-tibetan/10 border border-tibetan/30 flex items-center justify-center">
          <WifiOff className="h-10 w-10 text-tibetan" />
        </div>

        {/* Heading */}
        <div>
          <h1 className="text-xl font-serif font-bold text-foreground mb-2">
            No Internet Connection
          </h1>
          <p className="text-sm text-muted-foreground">
            NEXUS BHUTAN requires an active internet connection to operate.
            Please restore connectivity to continue.
          </p>
        </div>

        {/* Status */}
        <div className="w-full p-3 bg-tibetan/10 border border-tibetan/20 rounded-lg">
          <p className="text-xs text-tibetan font-medium">
            ● Offline — transactions are blocked
          </p>
        </div>

        {/* Retry button */}
        <Button
          onClick={handleRetry}
          disabled={checking}
          className="w-full bg-primary hover:bg-primary/90"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Checking...' : 'Retry Connection'}
        </Button>

        <p className="text-xs text-muted-foreground">
          Auto-retrying every 5 seconds
        </p>
      </div>
    </div>
  )
}
