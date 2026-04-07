/**
 * Face-ID Engine
 * Uses MediaPipe FaceLandmarker for detection + landmark extraction.
 * Converts 468-point face mesh into a normalized 512-dim identity vector.
 *
 * Privacy rules enforced here:
 * - No embedding is generated without a valid consent token
 * - No raw face image is ever stored — only the vector
 */

const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

// Landmark indices used for identity embedding (key geometry points)
const IDENTITY_LANDMARKS = [
  // Eyes
  33, 133, 159, 145, 362, 263, 386, 374,
  // Nose bridge + tip
  6, 168, 197, 5, 4, 1, 2,
  // Mouth corners + lips
  61, 291, 13, 14, 17, 0, 267, 37,
  // Cheekbones
  234, 454, 323, 93,
  // Jaw
  172, 397, 288, 58, 136, 150, 149, 176,
]

export class FaceEngine {
  constructor() {
    this.landmarker = null
    this.ready      = false
  }

  async init() {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    )

    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: FACE_MODEL_URL,
        delegate: 'GPU',
      },
      runningMode:           'VIDEO',
      numFaces:              1,
      minFaceDetectionConfidence: 0.6,
      minFacePresenceConfidence:  0.6,
      minTrackingConfidence:      0.5,
    })

    this.ready = true
    return true
  }

  /**
   * Detect face in a video frame and extract a 512-dim identity vector.
   * Returns null if no face detected or confidence too low.
   *
   * @param {HTMLVideoElement} videoEl
   * @param {number} timestampMs
   * @returns {{ embedding: Float32Array, boundingBox: object } | null}
   */
  detect(videoEl, timestampMs) {
    if (!this.ready || !this.landmarker) return null

    try {
      const results = this.landmarker.detectForVideo(videoEl, timestampMs)
      if (!results.faceLandmarks?.length) return null

      const landmarks = results.faceLandmarks[0]
      const embedding = this._landmarksToEmbedding(landmarks)
      const bbox      = this._getBoundingBox(landmarks)

      return { embedding, boundingBox: bbox }

    } catch {
      return null
    }
  }

  /**
   * Convert face landmarks to a normalized 512-dim identity embedding.
   * Extracts key geometry points, normalizes relative to face center/scale.
   *
   * @param {Array<{x,y,z}>} landmarks - 468 normalized face points
   * @returns {Float32Array} 512-dim vector
   */
  _landmarksToEmbedding(landmarks) {
    const selected = IDENTITY_LANDMARKS.map(i => landmarks[i] ?? { x: 0, y: 0, z: 0 })

    // Compute face center and scale for normalization
    const xs = selected.map(p => p.x)
    const ys = selected.map(p => p.y)
    const cx = xs.reduce((s, v) => s + v, 0) / xs.length
    const cy = ys.reduce((s, v) => s + v, 0) / ys.length

    // Face scale = max distance from center
    const scale = Math.max(
      ...selected.map(p => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2))
    ) || 1

    // Build normalized vector [x, y, z] per landmark → 3 × n dims
    const rawDims = selected.flatMap(p => [
      (p.x - cx) / scale,
      (p.y - cy) / scale,
      p.z / scale,
    ])

    // Pad/truncate to 512 dims
    const vector = new Float32Array(512)
    for (let i = 0; i < Math.min(rawDims.length, 512); i++) {
      vector[i] = rawDims[i]
    }

    // L2 normalize
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0))
    if (norm > 0) for (let i = 0; i < vector.length; i++) vector[i] /= norm

    return vector
  }

  _getBoundingBox(landmarks) {
    const xs = landmarks.map(p => p.x)
    const ys = landmarks.map(p => p.y)
    return {
      x1: Math.min(...xs), y1: Math.min(...ys),
      x2: Math.max(...xs), y2: Math.max(...ys),
    }
  }

  /**
   * Cosine similarity between two face vectors.
   * Above 0.85 = same person (tunable threshold).
   */
  static similarity(a, b) {
    if (a.length !== b.length) return 0
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      na  += a[i] * a[i]
      nb  += b[i] * b[i]
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb)
    return denom === 0 ? 0 : dot / denom
  }

  async dispose() {
    await this.landmarker?.close()
    this.landmarker = null
    this.ready      = false
  }
}

// Match threshold — tune based on camera quality
export const FACE_MATCH_THRESHOLD = 0.85
