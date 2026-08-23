/**
 * YOLO ONNX Inference Engine
 * Runs YOLO26 (or YOLOv8n for testing) via ONNX Runtime Web.
 * Execution path: WebGPU → WASM multi-threaded → CPU
 *
 * Usage:
 *   const engine = new YoloEngine()
 *   await engine.init()
 *   const detections = await engine.detect(videoElement)
 */

import { MODEL_CONFIG, CLASS_NAMES } from './model-config'

export class YoloEngine {
  constructor() {
    this.session     = null
    this.ort         = null   // the onnxruntime module, loaded in init()
    this.provider    = null   // 'webgpu' | 'wasm' | 'cpu'
    this.ready       = false
    this.frameCount  = 0
    this.frameSkip   = MODEL_CONFIG.FRAME_SKIP_BASE
    this.lastInferMs = 0
  }

  /**
   * Initialise ONNX session with best available execution provider.
   * @returns {Promise<{ provider: string, modelUrl: string }>}
   */
  async init() {
    const ort = await import('onnxruntime-web')

    // The runtime's own WASM binaries, served from public/onnx/ (put there by
    // scripts/fetch-vision-assets.mjs — they are 38 MB and not in git). Every provider needs
    // them, so if this folder is missing nothing loads and the failure looks like a bad model.
    ort.env.wasm.wasmPaths = '/onnx/'

    // Multi-threading needs SharedArrayBuffer, which the browser only grants a
    // cross-origin-isolated page (COOP + COEP headers). We do not send those, so asking for
    // threads here would fail the WASM provider outright on an otherwise healthy setup.
    // Single-threaded is slower, not broken — take it unless the page really is isolated.
    const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
    ort.env.wasm.numThreads = isolated
      ? Math.min(MODEL_CONFIG.WASM_CONFIG.numThreads, navigator.hardwareConcurrency || 1)
      : 1

    // Check the model is actually there first. Otherwise each provider fails on its own fetch
    // and the error blames "browser support" for a missing file.
    try {
      const head = await fetch(MODEL_CONFIG.MODEL_URL, { method: 'HEAD' })
      if (!head.ok) {
        throw new Error(
          `No detection model at ${MODEL_CONFIG.MODEL_URL} (HTTP ${head.status}). ` +
          'Install one with: node scripts/fetch-vision-assets.mjs --model <url or path>'
        )
      }
    } catch (err) {
      // A network-level failure here is still the model's fetch failing — report it as such.
      if (err instanceof TypeError) {
        throw new Error(`Could not reach ${MODEL_CONFIG.MODEL_URL}: ${err.message}`)
      }
      throw err
    }

    const failures = []
    for (const provider of MODEL_CONFIG.EXECUTION_PROVIDERS) {
      try {
        this.ort = ort
        this.session = await ort.InferenceSession.create(MODEL_CONFIG.MODEL_URL, {
          executionProviders: [provider],
          graphOptimizationLevel: 'all',
          enableCpuMemArena: true,
        })
        this.provider = provider
        this.ready    = true

        console.log(`[YOLO] Loaded via ${provider}${isolated ? '' : ' (single-threaded)'}`)
        return { provider, modelUrl: MODEL_CONFIG.MODEL_URL }

      } catch (err) {
        console.warn(`[YOLO] ${provider} failed:`, err.message)
        failures.push(`${provider}: ${err.message}`)
      }
    }

    // Say which provider failed and why. "All execution providers failed" on its own sent the
    // last person looking at the model file when the runtime was what was missing.
    throw new Error(`No execution provider could load the model — ${failures.join(' | ')}`)
  }

  /**
   * Run inference on a video element or canvas.
   * Applies adaptive frame skipping based on inference latency.
   *
   * @param {HTMLVideoElement|HTMLCanvasElement} source
   * @returns {Promise<Detection[]|null>} null if frame was skipped
   */
  async detect(source) {
    if (!this.ready || !this.session) return null

    // Adaptive frame skipping
    this.frameCount++
    if (this.frameCount % this.frameSkip !== 0) return null

    const t0 = performance.now()

    try {
      const input    = this._preprocess(source)
      const feeds    = { images: input }
      const results  = await this.session.run(feeds)
      const detections = this._postprocess(results)

      this.lastInferMs = performance.now() - t0
      this._adaptFrameSkip()

      return detections

    } catch (err) {
      console.error('[YOLO] Inference error:', err)
      return null
    }
  }

  /**
   * Preprocess: resize source to 640×640, normalize to [0,1], CHW format.
   * @param {HTMLVideoElement|HTMLCanvasElement} source
   * @returns {ORT.Tensor}
   */
  _preprocess(source) {
    // The module imported in init(), kept on the instance. `require` is not defined in a browser
    // bundle, so reaching for it here threw on every single frame — and detect()'s catch turned
    // that into a silent "Inference error" with no detections, forever.
    const ort    = this.ort
    const canvas = document.createElement('canvas')
    canvas.width  = MODEL_CONFIG.INPUT_WIDTH
    canvas.height = MODEL_CONFIG.INPUT_HEIGHT
    const ctx = canvas.getContext('2d')
    ctx.drawImage(source, 0, 0, MODEL_CONFIG.INPUT_WIDTH, MODEL_CONFIG.INPUT_HEIGHT)

    const imageData = ctx.getImageData(0, 0, MODEL_CONFIG.INPUT_WIDTH, MODEL_CONFIG.INPUT_HEIGHT)
    const { data }  = imageData
    const pixels    = MODEL_CONFIG.INPUT_WIDTH * MODEL_CONFIG.INPUT_HEIGHT

    // RGBA → RGB normalized float32 in CHW format [1, 3, 640, 640]
    const float32 = new Float32Array(3 * pixels)
    for (let i = 0; i < pixels; i++) {
      float32[i]              = data[i * 4]     / 255.0  // R
      float32[pixels + i]     = data[i * 4 + 1] / 255.0  // G
      float32[pixels * 2 + i] = data[i * 4 + 2] / 255.0  // B
    }

    return new ort.Tensor('float32', float32, [1, 3, MODEL_CONFIG.INPUT_WIDTH, MODEL_CONFIG.INPUT_HEIGHT])
  }

  /**
   * Postprocess YOLO end-to-end output.
   * end2end models output [num_detections, 6] — [x1,y1,x2,y2,conf,class_id]
   * @returns {Detection[]}
   */
  _postprocess(results) {
    const outputKey  = Object.keys(results)[0]
    const outputData = results[outputKey].data
    const dims       = results[outputKey].dims

    // Two output shapes, and they mean completely different things:
    //
    //   [1, N, 6]      end-to-end export — NMS already applied, each row is
    //                  x1, y1, x2, y2, confidence, classId. This is what yolo26s_end2end.onnx
    //                  will give us.
    //   [1, 84, 8400]  the standard YOLOv8 head — 8400 candidate anchors, CHANNEL-major, with
    //                  no NMS. Channels are cx, cy, w, h then one score per class.
    //
    // Both have three dimensions, so a `dims.length === 3` test does not tell them apart: the
    // old code read the standard head as if it were end-to-end and produced boxes from whatever
    // floats happened to sit six apart. Split on the channel count instead.
    const isEndToEnd = dims[2] === 6

    const boxes = isEndToEnd
      ? this._decodeEndToEnd(outputData, dims)
      : this._decodeYoloHead(outputData, dims)

    // The standard head emits overlapping duplicates of the same object by design; without NMS
    // one bottle arrives as a dozen boxes.
    return isEndToEnd ? boxes : this._nms(boxes, MODEL_CONFIG.IOU_THRESHOLD)
  }

  /** [1, N, 6] — already thresholded and de-duplicated by the model. */
  _decodeEndToEnd(data, dims) {
    const out = []
    for (let i = 0; i < dims[1]; i++) {
      const o = i * 6
      const confidence = data[o + 4]
      if (confidence < MODEL_CONFIG.CONFIDENCE_THRESHOLD) continue
      out.push(this._box(data[o], data[o + 1], data[o + 2], data[o + 3], confidence, Math.round(data[o + 5])))
    }
    return out
  }

  /** [1, 4 + numClasses, anchors], channel-major, boxes as centre/size in input pixels. */
  _decodeYoloHead(data, dims) {
    const channels = dims[1]
    const anchors  = dims[2]
    const classes  = channels - 4
    const out = []

    for (let a = 0; a < anchors; a++) {
      // Pick the best class first and skip the anchor entirely if it is below threshold —
      // 8400 anchors per frame is the hot loop of the whole pipeline.
      let best = 0
      let bestScore = data[4 * anchors + a]
      for (let c = 1; c < classes; c++) {
        const score = data[(4 + c) * anchors + a]
        if (score > bestScore) { bestScore = score; best = c }
      }
      if (bestScore < MODEL_CONFIG.CONFIDENCE_THRESHOLD) continue

      const cx = data[a]
      const cy = data[anchors + a]
      const w  = data[2 * anchors + a]
      const h  = data[3 * anchors + a]
      out.push(this._box(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, bestScore, best))
    }
    return out
  }

  /** One detection, with coordinates normalised 0-1 so they apply to the original 4K frame. */
  _box(x1, y1, x2, y2, confidence, classId) {
    const W = MODEL_CONFIG.INPUT_WIDTH
    const H = MODEL_CONFIG.INPUT_HEIGHT
    return {
      x1: x1 / W, y1: y1 / H, x2: x2 / W, y2: y2 / H,
      confidence,
      classId,
      className: CLASS_NAMES[classId] ?? `class_${classId}`,
      cropX: x1 / W,
      cropY: y1 / H,
      cropW: (x2 - x1) / W,
      cropH: (y2 - y1) / H,
    }
  }

  /** Greedy non-maximum suppression: keep the most confident box, drop what it overlaps. */
  _nms(boxes, iouThreshold) {
    const kept = []
    const byConfidence = boxes.slice().sort((a, b) => b.confidence - a.confidence)

    for (const candidate of byConfidence) {
      let overlapped = false
      for (const k of kept) {
        // Suppress only within the same class — a bottle sitting on a book is two detections.
        if (k.classId !== candidate.classId) continue
        if (this._iou(k, candidate) > iouThreshold) { overlapped = true; break }
      }
      if (!overlapped) kept.push(candidate)
    }
    return kept
  }

  _iou(a, b) {
    const x1 = Math.max(a.x1, b.x1)
    const y1 = Math.max(a.y1, b.y1)
    const x2 = Math.min(a.x2, b.x2)
    const y2 = Math.min(a.y2, b.y2)
    const overlap = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
    if (overlap <= 0) return 0
    const areaA = (a.x2 - a.x1) * (a.y2 - a.y1)
    const areaB = (b.x2 - b.x1) * (b.y2 - b.y1)
    return overlap / (areaA + areaB - overlap)
  }

  /**
   * Adaptive frame skip — increases if inference is slow, decreases if fast.
   */
  _adaptFrameSkip() {
    if (this.lastInferMs > 150) {
      this.frameSkip = Math.min(this.frameSkip + 1, 8)
    } else if (this.lastInferMs < 80 && this.frameSkip > MODEL_CONFIG.FRAME_SKIP_BASE) {
      this.frameSkip = Math.max(this.frameSkip - 1, MODEL_CONFIG.FRAME_SKIP_BASE)
    }
  }

  /**
   * Dispose ONNX session and free GPU memory.
   */
  async dispose() {
    if (this.session) {
      await this.session.release()
      this.session = null
      this.ready   = false
    }
  }

  get inferenceMs() { return this.lastInferMs }
  get executionProvider() { return this.provider }
}

/**
 * @typedef {Object} Detection
 * @property {number} x1 - normalized left (0-1)
 * @property {number} y1 - normalized top (0-1)
 * @property {number} x2 - normalized right (0-1)
 * @property {number} y2 - normalized bottom (0-1)
 * @property {number} confidence
 * @property {number} classId
 * @property {string} className
 * @property {number} cropX - for 4K high-res crop
 * @property {number} cropY
 * @property {number} cropW
 * @property {number} cropH
 */
