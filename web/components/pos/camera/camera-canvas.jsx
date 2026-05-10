"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Camera, CameraOff, Cpu, Zap, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { YoloEngine }            from "@/lib/vision/yolo-engine"
import { ProductEmbeddingStore } from "@/lib/vision/product-embeddings"
import { runSkuPipeline }        from "@/lib/vision/sku-recognition"
import { MODEL_CONFIG }          from "@/lib/vision/model-config"

/**
 * 4K Camera Canvas with real-time YOLO26 detection overlay.
 * Gold bounding boxes pulse on confirmed SKU matches.
 * Unrecognized detections show grey boxes.
 *
 * @param {{
 *   onProductRecognized: (product: { productId, name, sku, score }) => void,
 *   active: boolean,
 * }} props
 */
export function CameraCanvas({ onProductRecognized, active = true }) {
  const videoRef      = useRef(null)
  const canvasRef     = useRef(null)
  const engineRef     = useRef(null)
  const embStoreRef   = useRef(null)
  const rafRef        = useRef(null)
  const streamRef     = useRef(null)

  const [status,       setStatus]       = useState('idle')    // idle|loading|ready|error|no-camera
  const [provider,     setProvider]     = useState(null)      // webgpu|wasm|cpu
  const [inferMs,      setInferMs]      = useState(0)
  const [detections,   setDetections]   = useState([])        // current frame detections
  const [recognized,   setRecognized]   = useState({})        // detectionId → product
  const [embedCount,   setEmbedCount]   = useState(0)
  const [errorMsg,     setErrorMsg]     = useState(null)

  // ── Initialise camera + engine ───────────────────────────────────────────
  useEffect(() => {
    if (!active) return
    let cancelled = false

    async function init() {
      setStatus('loading')

      // 1. Request 4K camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width:  { ideal: MODEL_CONFIG.CAMERA_WIDTH },
            height: { ideal: MODEL_CONFIG.CAMERA_HEIGHT },
            facingMode: 'environment',
          }
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch (err) {
        setStatus('no-camera')
        setErrorMsg('Camera access denied or no camera found.')
        return
      }

      // 2. Load YOLO engine
      try {
        const engine = new YoloEngine()
        const { provider } = await engine.init()
        engineRef.current = engine
        setProvider(provider)
      } catch (err) {
        setStatus('error')
        setErrorMsg(`Model load failed: ${err.message}`)
        return
      }

      // 3. Init embedding store
      const store = new ProductEmbeddingStore()
      const count = await store.init()
      await store.syncFromSupabase()
      embStoreRef.current = store
      setEmbedCount(count)

      if (!cancelled) {
        setStatus('ready')
        startLoop()
      }
    }

    init()

    return () => {
      cancelled = true
      stopLoop()
      stopCamera()
      engineRef.current?.dispose()
    }
  }, [active])

  // ── Inference loop ───────────────────────────────────────────────────────
  function startLoop() {
    async function loop() {
      if (!videoRef.current || !engineRef.current) return

      const dets = await engineRef.current.detect(videoRef.current)

      if (dets !== null) {
        setInferMs(Math.round(engineRef.current.inferenceMs))
        setDetections(dets)

        // Run SKU pipeline on detections
        if (embStoreRef.current && dets.length > 0) {
          await runSkuPipeline({
            videoEl:           videoRef.current,
            detections:        dets,
            embeddingStore:    embStoreRef.current,
            mediapipeEmbedder: null,
            onRecognized: (detection, product) => {
              const key = `${Math.round(detection.x1 * 100)}_${Math.round(detection.y1 * 100)}`
              setRecognized(prev => ({ ...prev, [key]: product }))
              onProductRecognized?.(product)
            },
          })
        }

        drawOverlay(dets)
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
  }

  function stopLoop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  // ── Canvas overlay drawing ───────────────────────────────────────────────
  function drawOverlay(dets) {
    const canvas  = canvasRef.current
    const video   = videoRef.current
    if (!canvas || !video) return

    canvas.width  = video.clientWidth
    canvas.height = video.clientHeight
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const det of dets) {
      const x = det.x1 * canvas.width
      const y = det.y1 * canvas.height
      const w = (det.x2 - det.x1) * canvas.width
      const h = (det.y2 - det.y1) * canvas.height
      const key = `${Math.round(det.x1 * 100)}_${Math.round(det.y1 * 100)}`
      const product = recognized[key]

      if (product) {
        // Gold — confirmed SKU match
        ctx.strokeStyle = '#D4AF37'
        ctx.lineWidth   = 3
        ctx.shadowColor = '#D4AF37'
        ctx.shadowBlur  = 12
        ctx.strokeRect(x, y, w, h)
        ctx.shadowBlur  = 0

        // Label background
        ctx.fillStyle = 'rgba(212, 175, 55, 0.85)'
        ctx.fillRect(x, y - 22, w, 22)
        ctx.fillStyle = '#000'
        ctx.font      = 'bold 11px Noto Sans'
        ctx.fillText(`${product.name} (${Math.round(product.score * 100)}%)`, x + 4, y - 6)

      } else {
        // Grey — detected but unmatched
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)'
        ctx.lineWidth   = 1.5
        ctx.strokeRect(x, y, w, h)

        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)'
        ctx.fillRect(x, y - 18, Math.min(w, 120), 18)
        ctx.fillStyle = 'rgba(148, 163, 184, 0.9)'
        ctx.font      = '10px Noto Sans'
        ctx.fillText(`${det.className} ${Math.round(det.confidence * 100)}%`, x + 4, y - 4)
      }
    }
  }

  // ── Provider badge ───────────────────────────────────────────────────────
  const providerBadge = {
    webgpu: { label: 'WebGPU', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
    wasm:   { label: 'WASM',   color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
    cpu:    { label: 'CPU',    color: 'bg-tibetan/10 text-tibetan border-tibetan/30' },
  }[provider] ?? null

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full bg-obsidian rounded-xl overflow-hidden">

      {/* Video feed */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        muted
        playsInline
        autoPlay
      />

      {/* Detection overlay canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Loading state */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-obsidian gap-3">
          <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading AI model...</p>
        </div>
      )}

      {/* Error states */}
      {(status === 'error' || status === 'no-camera') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-obsidian gap-4">
          {status === 'no-camera'
            ? <CameraOff className="h-12 w-12 text-tibetan" />
            : <AlertTriangle className="h-12 w-12 text-tibetan" />
          }
          <p className="text-sm text-tibetan text-center px-4">{errorMsg}</p>
          {status === 'error' && (
            <p className="text-xs text-muted-foreground text-center px-4">
              Place model file at <code className="bg-muted px-1 rounded">public/models/yolov8n.onnx</code>
            </p>
          )}
        </div>
      )}

      {/* Idle state */}
      {status === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-obsidian gap-3">
          <Camera className="h-12 w-12 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">Camera inactive</p>
        </div>
      )}

      {/* HUD — top left */}
      {status === 'ready' && (
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {providerBadge && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${providerBadge.color}`}>
              <Zap className="h-2.5 w-2.5" />
              {providerBadge.label}
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-obsidian/70 text-muted-foreground border border-border/30">
            <Cpu className="h-2.5 w-2.5" />
            {inferMs}ms
          </span>
          {embedCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-obsidian/70 text-muted-foreground border border-border/30">
              {embedCount} products
            </span>
          )}
        </div>
      )}

      {/* HUD — top right — detection count */}
      {status === 'ready' && detections.length > 0 && (
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/80 text-primary-foreground">
            {detections.length} detected
          </span>
        </div>
      )}

      {/* Scanning animation border when active + ready */}
      {status === 'ready' && (
        <div className="absolute inset-0 rounded-xl border-2 border-primary/20 pointer-events-none" />
      )}
    </div>
  )
}
