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

    // Configure WASM paths (served from /public/)
    ort.env.wasm.wasmPaths = '/onnx/'
    ort.env.wasm.numThreads = MODEL_CONFIG.WASM_CONFIG.numThreads

    const providers = MODEL_CONFIG.EXECUTION_PROVIDERS

    for (const provider of providers) {
      try {
        const sessionOptions = {
          executionProviders: [provider],
          graphOptimizationLevel: 'all',
          enableCpuMemArena: true,
        }

        if (provider === 'wasm') {
          sessionOptions.executionProviders = [{
            name: 'wasm',
            wasmFilePaths: {
              'ort-wasm-simd-threaded.wasm': '/onnx/ort-wasm-simd-threaded.wasm',
            },
          }]
        }

        this.session  = await ort.InferenceSession.create(
          MODEL_CONFIG.MODEL_URL,
          sessionOptions
        )
        this.provider = provider
        this.ready    = true

        console.log(`[YOLO] Loaded via ${provider}`)
        return { provider, modelUrl: MODEL_CONFIG.MODEL_URL }

      } catch (err) {
        console.warn(`[YOLO] ${provider} failed:`, err.message)
        continue
      }
    }

    throw new Error('All execution providers failed. Check model file and browser support.')
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
    const ort    = require('onnxruntime-web')
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
    // Handle both end2end and standard YOLO output formats
    const outputKey  = Object.keys(results)[0]
    const outputData = results[outputKey].data
    const outputDims = results[outputKey].dims

    const detections = []

    // End-to-end format: [batch, num_dets, 6]
    if (outputDims.length === 3) {
      const numDets = outputDims[1]
      for (let i = 0; i < numDets; i++) {
        const offset    = i * 6
        const x1        = outputData[offset]
        const y1        = outputData[offset + 1]
        const x2        = outputData[offset + 2]
        const y2        = outputData[offset + 3]
        const confidence = outputData[offset + 4]
        const classId   = Math.round(outputData[offset + 5])

        if (confidence < MODEL_CONFIG.CONFIDENCE_THRESHOLD) continue

        detections.push({
          x1:         x1 / MODEL_CONFIG.INPUT_WIDTH,
          y1:         y1 / MODEL_CONFIG.INPUT_HEIGHT,
          x2:         x2 / MODEL_CONFIG.INPUT_WIDTH,
          y2:         y2 / MODEL_CONFIG.INPUT_HEIGHT,
          confidence,
          classId,
          className:  CLASS_NAMES[classId] ?? `class_${classId}`,
          // High-res crop coordinates (relative 0-1, applied to original 4K frame)
          cropX:      x1 / MODEL_CONFIG.INPUT_WIDTH,
          cropY:      y1 / MODEL_CONFIG.INPUT_HEIGHT,
          cropW:      (x2 - x1) / MODEL_CONFIG.INPUT_WIDTH,
          cropH:      (y2 - y1) / MODEL_CONFIG.INPUT_HEIGHT,
        })
      }
    }

    return detections
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
