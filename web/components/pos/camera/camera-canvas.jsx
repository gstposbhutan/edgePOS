"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Camera, CameraOff, Cpu, Zap, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { YoloEngine }            from "@/lib/vision/yolo-engine"
import { ProductEmbeddingStore } from "@/lib/vision/product-embeddings"
import { runSkuPipeline, matchHeldItem } from "@/lib/vision/sku-recognition"
import { MODEL_CONFIG }          from "@/lib/vision/model-config"

/**
 * 4K Camera Canvas with real-time YOLO26 detection overlay.
 * Gold bounding boxes pulse on confirmed SKU matches.
 * Unrecognized detections show grey boxes.
 *
 * The pad sizes itself to the camera's OWN resolution: the frame keeps the stream's aspect
 * ratio and grows to whatever width the section gives it, capped at `maxHeightVh` of the
 * viewport so it cannot push the rest of the screen out of the way. Nothing is cropped — which
 * also matters for correctness, not just looks: the detection overlay maps normalised box
 * coordinates straight onto this element, so a letterboxed or cover-cropped video would draw
 * every box in the wrong place.
 *
 * @param {{
 *   onProductRecognized: (product: { productId, name, sku, score }) => void,
 *   active: boolean,
 *   maxHeightVh?: number,
 * }} props
 */
export function CameraCanvas({ onProductRecognized, active = true, maxHeightVh = 52 }) {
  const videoRef      = useRef(null)
  const canvasRef     = useRef(null)
  const engineRef     = useRef(null)
  const embStoreRef   = useRef(null)
  const embedderRef   = useRef(null)   // MediaPipe ImageEmbedder — one instance, two jobs
  const rafRef        = useRef(null)
  const streamRef     = useRef(null)

  const [status,       setStatus]       = useState('idle')    // idle|loading|ready|error|no-camera
  const [provider,     setProvider]     = useState(null)      // webgpu|wasm|cpu
  const [inferMs,      setInferMs]      = useState(0)
  const [detections,   setDetections]   = useState([])        // current frame detections
  const [recognized,   setRecognized]   = useState({})        // detectionId → product
  const [embedCount,   setEmbedCount]   = useState(0)
  const [errorMsg,     setErrorMsg]     = useState(null)
  // The stream's actual resolution. 4K is only ever *requested* — the camera answers with what
  // it has (often 1280x720 or a 4:3 sensor), so the frame has to follow the answer, not the ask.
  const [resolution,   setResolution]   = useState(null)     // { w, h } once metadata arrives
  const [catalogMsg,   setCatalogMsg]   = useState(null)     // what the catalog sync is doing
  const [lastMatch,    setLastMatch]    = useState(null)     // most recent recognised product

  // Until the camera reports its own size, assume the shape we asked for — that way the pad
  // does not visibly jump when the real resolution arrives a frame later.
  const aspect = resolution
    ? resolution.w / resolution.h
    : MODEL_CONFIG.CAMERA_WIDTH / MODEL_CONFIG.CAMERA_HEIGHT

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
          // videoWidth/Height are 0 until metadata lands; play() resolving is not a guarantee.
          const readSize = () => {
            const v = videoRef.current
            if (v?.videoWidth && v?.videoHeight) setResolution({ w: v.videoWidth, h: v.videoHeight })
          }
          readSize()
          videoRef.current.addEventListener('loadedmetadata', readSize)
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

      // 3. Feature extractor. This is the piece that decides whether "recognition" means
      //    anything: with it, a crop and a catalog photo land in the same MobileNet space and
      //    can be compared; without it the pipeline falls back to a colour histogram that
      //    cannot tell one red packet from another.
      //    Assets are served locally (scripts/fetch-vision-assets.mjs) — a till must not depend
      //    on a CDN reachable from Thimphu.
      let extractor = null
      try {
        const { FilesetResolver, ImageEmbedder } = await import('@mediapipe/tasks-vision')
        const fileset = await FilesetResolver.forVisionTasks('/mediapipe')
        const embedder = await ImageEmbedder.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/models/mobilenet_v3_small.tflite' },
          quantize: false,
        })
        embedderRef.current = embedder
        // One wrapper, handed to both the catalog sync and the crop pipeline, so there is no way
        // for the two sides to drift onto different models.
        extractor = {
          embed: (source) => {
            const out = embedder.embed(source)
            const e = out?.embeddings?.[0]
            return e ? new Float32Array(e.floatEmbedding ?? e.quantizedEmbedding) : null
          },
        }
      } catch (err) {
        console.warn('[SKU] image embedder unavailable:', err.message)
      }

      // 4. Catalog → local vectors, in that same space.
      const store = new ProductEmbeddingStore()
      await store.init()
      setCatalogMsg('Reading product catalog…')
      const count = await store.syncFromServer(extractor, (done, total) => {
        setCatalogMsg(`Learning products ${done}/${total}…`)
      })
      embStoreRef.current = store
      setEmbedCount(count)
      setCatalogMsg(null)
      if (count === 0) {
        // Say it plainly: the pad will draw boxes and name nothing, and the reason is the
        // catalog, not the camera.
        const withImage = store.coverage?.withImage ?? 0
        console.warn(withImage === 0
          ? '[SKU] no product in this shop has a photo — nothing can be recognised'
          : '[SKU] catalog photos could not be embedded')
      }

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
      try { embedderRef.current?.close() } catch { /* already gone */ }
    }
  }, [active])

  // ── Inference loop ───────────────────────────────────────────────────────
  // A held item stays in frame for many frames; without this it would be added to the bill
  // once per frame. Same product within the cooldown is treated as still-being-shown.
  const lastAddRef = useRef({ productId: null, at: 0 })
  const ADD_COOLDOWN_MS = 4000

  function announce(product) {
    const now = Date.now()
    const last = lastAddRef.current
    if (last.productId === product.productId && now - last.at < ADD_COOLDOWN_MS) return
    lastAddRef.current = { productId: product.productId, at: now }
    setLastMatch({ ...product, at: now })
    onProductRecognized?.(product)
  }

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
            mediapipeEmbedder: embedderRef.current,
            onRecognized: (detection, product) => {
              const key = `${Math.round(detection.x1 * 100)}_${Math.round(detection.y1 * 100)}`
              setRecognized(prev => ({ ...prev, [key]: product }))
              announce(product)
            },
          })
        } else if (embStoreRef.current && dets.length === 0) {
          // Nothing boxed. The detector only knows COCO classes, so most of a grocery is
          // invisible to it — try the middle of the frame, which is where a held-up item is.
          const product = await matchHeldItem({
            videoEl:           videoRef.current,
            embeddingStore:    embStoreRef.current,
            mediapipeEmbedder: embedderRef.current,
          })
          if (product) announce(product)
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
    <div className="w-full flex items-center justify-center">
      {/*
        Width is capped two ways at once: the section's own width, and whatever width would make
        the frame taller than maxHeightVh. Height then follows from the aspect ratio, so the
        camera's full frame is always visible and never cropped.
        `max-height` alone would NOT do: with width pinned at 100% the browser clamps the height
        and silently breaks the ratio, which is how the overlay drifts off the objects.
      */}
      <div
        className="relative w-full bg-obsidian rounded-xl overflow-hidden"
        style={{
          aspectRatio: `${aspect}`,
          width: `min(100%, calc(${maxHeightVh}vh * ${aspect}))`,
        }}
      >

      {/* Video feed */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
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
          <p className="text-sm text-muted-foreground">{catalogMsg ?? 'Loading AI model…'}</p>
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
            // The runtime and the model are build assets, not commits — the script installs
            // both. Naming only the model sent the last person hunting for a file when it was
            // the 38 MB WASM runtime that was missing.
            <p className="text-xs text-muted-foreground text-center px-4">
              Vision assets missing. Run{' '}
              <code className="bg-muted px-1 rounded">npm run vision:assets</code> in{' '}
              <code className="bg-muted px-1 rounded">web/</code> — it installs the ONNX runtime
              and reports how to obtain a model.
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
          {resolution && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-obsidian/70 text-muted-foreground border border-border/30 tabular-nums">
              {resolution.w}×{resolution.h}
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
            embedCount > 0
              ? 'bg-obsidian/70 text-muted-foreground border-border/30'
              : 'bg-tibetan/20 text-tibetan border-tibetan/40'
          }`}>
            {embedCount > 0 ? `${embedCount} products known` : 'no product photos — cannot match'}
          </span>
        </div>
      )}

      {/* HUD — bottom: what was just recognised. Without this the pad silently adds a line and
          the cashier has to look away at the ticket to find out what it thought it saw. */}
      {status === 'ready' && lastMatch && (
        <div className="absolute bottom-3 left-3 right-3 flex justify-center pointer-events-none">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-primary/90 text-primary-foreground shadow">
            ✓ {lastMatch.name}
            <span className="opacity-75 tabular-nums">{Math.round(lastMatch.score * 100)}%</span>
          </span>
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
    </div>
  )
}
