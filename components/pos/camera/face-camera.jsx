"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { UserCheck, UserX, Smile } from "lucide-react"
import { FaceEngine }  from "@/lib/vision/face-engine"
import { FaceStore }   from "@/lib/vision/face-store"

/**
 * Floating front-camera Face-ID widget.
 * Runs continuously in the background — identifies customer silently.
 * Shows a small preview with recognition state.
 *
 * @param {{
 *   entityId: string,
 *   onIdentified: (profile: { id, whatsapp_no, name, score }) => void,
 *   onUnidentified: () => void,
 *   active: boolean,
 * }} props
 */
export function FaceCamera({ entityId, onIdentified, onUnidentified, active = true }) {
  const videoRef    = useRef(null)
  const streamRef   = useRef(null)
  const engineRef   = useRef(null)
  const storeRef    = useRef(null)
  const rafRef      = useRef(null)
  const lastMatchRef = useRef(null)  // debounce — same person for 3 frames = confirmed

  const [status,   setStatus]   = useState('idle')    // idle|loading|scanning|matched|no-face
  const [matched,  setMatched]  = useState(null)
  const [frameN,   setFrameN]   = useState(0)

  useEffect(() => {
    if (!active || !entityId) return
    let cancelled = false

    async function init() {
      setStatus('loading')

      // Start front camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      } catch {
        setStatus('idle')
        return
      }

      // Init face engine
      try {
        const engine = new FaceEngine()
        await engine.init()
        engineRef.current = engine
      } catch {
        setStatus('idle')
        return
      }

      // Load face profiles
      const store = new FaceStore()
      await store.loadForEntity(entityId)
      storeRef.current = store

      if (!cancelled) {
        setStatus('scanning')
        // Brief delay so the MediaPipe WASM delegate finishes warming up
        // before the first detectForVideo call — avoids spurious console errors.
        setTimeout(startLoop, 500)
      }
    }

    init()

    return () => {
      cancelled = true
      stopLoop()
      streamRef.current?.getTracks().forEach(t => t.stop())
      engineRef.current?.dispose()
    }
  }, [active, entityId])

  function startLoop() {
    let consecutiveMatches = 0
    let lastProfileId      = null

    function loop() {
      if (!videoRef.current || !engineRef.current) return

      const result = engineRef.current.detect(videoRef.current, performance.now())

      if (result) {
        const match = storeRef.current?.match(result.embedding)

        if (match) {
          if (match.id === lastProfileId) {
            consecutiveMatches++
          } else {
            consecutiveMatches = 1
            lastProfileId = match.id
          }

          // Require 3 consecutive frames for confirmation — reduces false positives
          if (consecutiveMatches >= 3) {
            if (lastMatchRef.current?.id !== match.id) {
              lastMatchRef.current = match
              setMatched(match)
              setStatus('matched')
              onIdentified?.(match)
            }
          }
        } else {
          consecutiveMatches = 0
          lastProfileId      = null
          if (lastMatchRef.current) {
            lastMatchRef.current = null
            setMatched(null)
            setStatus('scanning')
            onUnidentified?.()
          }
          setStatus('scanning')
        }
      } else {
        setStatus('no-face')
      }

      setFrameN(n => n + 1)
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
  }

  function stopLoop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }

  if (!active) return null

  return (
    <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 transition-all duration-300
      shadow-lg shrink-0
      ${status === 'matched'  ? 'border-primary shadow-primary/30' :
        status === 'scanning' ? 'border-border' :
        'border-border/30'
      }">

      {/* Video feed — small circular preview */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover scale-x-[-1]"  // mirror front camera
        muted playsInline autoPlay
      />

      {/* Status overlay */}
      <div className={`absolute inset-0 flex items-center justify-center transition-all
        ${status === 'matched' ? 'bg-primary/20' : 'bg-transparent'}`}>
        {status === 'loading' && (
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
        {status === 'matched' && (
          <UserCheck className="h-6 w-6 text-primary drop-shadow" />
        )}
        {status === 'no-face' && (
          <UserX className="h-5 w-5 text-muted-foreground/50" />
        )}
        {status === 'scanning' && (
          <Smile className="h-5 w-5 text-muted-foreground/40" />
        )}
      </div>

      {/* Match tooltip */}
      {status === 'matched' && matched && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap
          bg-primary text-primary-foreground text-[9px] font-medium px-2 py-0.5 rounded-full shadow">
          {matched.name ?? matched.whatsapp_no}
        </div>
      )}
    </div>
  )
}
