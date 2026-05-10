/**
 * SKU Recognition Pipeline — 4-Stage
 *
 * Stage 1 (Localize):  YOLO26 runs on 640×640 downsampled frame → bounding boxes
 * Stage 2 (Crop):      Original 4K frame cropped at detected coordinates (high-res)
 * Stage 3 (Classify):  MobileNet-V3 / feature extractor generates embedding vector
 * Stage 4 (Match):     Vector compared against IndexedDB product embeddings
 */

import { MODEL_CONFIG } from './model-config'

/**
 * Crop a high-resolution region from the original 4K video frame.
 * YOLO detects at 640×640 but we crop from the full 4K source for accuracy.
 *
 * @param {HTMLVideoElement} videoEl - original 4K video
 * @param {Object} detection - normalized coordinates (0-1) from YOLO
 * @param {number} padFactor - padding around crop (default 0.1 = 10%)
 * @returns {HTMLCanvasElement} cropped canvas
 */
export function cropDetection(videoEl, detection, padFactor = 0.1) {
  const vw = videoEl.videoWidth  || MODEL_CONFIG.CAMERA_WIDTH
  const vh = videoEl.videoHeight || MODEL_CONFIG.CAMERA_HEIGHT

  // Add padding around detection
  const pad = padFactor
  const x1  = Math.max(0, detection.x1 - pad) * vw
  const y1  = Math.max(0, detection.y1 - pad) * vh
  const x2  = Math.min(1, detection.x2 + pad) * vw
  const y2  = Math.min(1, detection.y2 + pad) * vh
  const w   = x2 - x1
  const h   = y2 - y1

  const canvas = document.createElement('canvas')
  canvas.width  = Math.round(w)
  canvas.height = Math.round(h)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(videoEl, x1, y1, w, h, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * Extract a feature vector from a cropped image using MediaPipe Image Embedder.
 * Falls back to a simple pixel histogram if MediaPipe is unavailable.
 *
 * @param {HTMLCanvasElement} cropCanvas
 * @param {Object|null} embedder - MediaPipe ImageEmbedder instance
 * @returns {Promise<Float32Array>}
 */
export async function extractFeatureVector(cropCanvas, embedder = null) {
  if (embedder) {
    try {
      const result = embedder.embed(cropCanvas)
      const embedding = result.embeddings[0]
      return new Float32Array(embedding.floatEmbedding ?? embedding.quantizedEmbedding)
    } catch (err) {
      console.warn('[SKU] MediaPipe embedder failed, using fallback:', err.message)
    }
  }

  // Fallback: color histogram as a simple feature vector (128-dim)
  return extractColorHistogram(cropCanvas)
}

/**
 * Simple color histogram fallback (128 bins × 3 channels = 384-dim vector).
 * Used when GPU embedder is unavailable.
 * @param {HTMLCanvasElement} canvas
 * @returns {Float32Array}
 */
function extractColorHistogram(canvas) {
  const ctx       = canvas.getContext('2d')
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data }  = imageData
  const bins      = 32  // 32 bins per channel
  const hist      = new Float32Array(bins * 3)

  for (let i = 0; i < data.length; i += 4) {
    const r = Math.floor(data[i]     / 256 * bins)
    const g = Math.floor(data[i + 1] / 256 * bins)
    const b = Math.floor(data[i + 2] / 256 * bins)
    hist[r]             += 1
    hist[bins + g]      += 1
    hist[bins * 2 + b]  += 1
  }

  // L2 normalize
  const norm = Math.sqrt(hist.reduce((s, v) => s + v * v, 0))
  if (norm > 0) for (let i = 0; i < hist.length; i++) hist[i] /= norm

  return hist
}

/**
 * Full 4-stage SKU recognition pipeline.
 * Called once per YOLO detection batch.
 *
 * @param {{
 *   videoEl: HTMLVideoElement,
 *   detections: import('./yolo-engine').Detection[],
 *   embeddingStore: import('./product-embeddings').ProductEmbeddingStore,
 *   mediapipeEmbedder: Object|null,
 *   onRecognized: (detection, product) => void,
 * }} params
 */
export async function runSkuPipeline({ videoEl, detections, embeddingStore, mediapipeEmbedder, onRecognized }) {
  for (const detection of detections) {
    try {
      // Stage 2: High-res crop from 4K frame
      const cropCanvas = cropDetection(videoEl, detection)

      // Stage 3: Feature extraction
      const vector = await extractFeatureVector(cropCanvas, mediapipeEmbedder)

      // Stage 4: Match against product embeddings
      const match = embeddingStore.match(vector)

      if (match) {
        onRecognized(detection, match)
      }

    } catch (err) {
      console.warn('[SKU] Pipeline error for detection:', err.message)
    }
  }
}
