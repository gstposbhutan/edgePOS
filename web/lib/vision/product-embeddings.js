/**
 * Product Embedding Store
 * Manages local IndexedDB vector store for SKU matching.
 * Uses cosine similarity to match YOLO crop vectors against product embeddings.
 *
 * Flow:
 *   1. On POS load → fetch the shop's catalog (products that have a photo), embed each photo
 *      LOCALLY with the same embedder the pad runs on camera crops, cache in IndexedDB
 *   2. On detection → extract crop vector → cosine match → return product
 *
 * Why the images are embedded here rather than served as vectors: matching is only meaningful
 * between vectors from the SAME model. `products.image_embedding` is a 1536-dim LLM-style
 * column; the crop vector comes from MediaPipe's image embedder. Comparing them is noise. The
 * cache is keyed on the image URL, so a product re-photographed in the back office is
 * re-embedded on the next load and nothing else is recomputed.
 */

import { MODEL_CONFIG } from './model-config'

const DB_NAME    = 'nexus_embeddings'
const DB_VERSION = 1
const STORE_NAME = 'product_embeddings'

/**
 * @typedef {{ productId: string, name: string, sku: string, vector: Float32Array }} EmbeddingRecord
 */

/**
 * Load a product photo for embedding, through THIS origin.
 *
 * The embedder reads pixels, which needs an untainted canvas, which needs the image to be
 * same-origin or CORS-enabled. The image CDN sends no Access-Control-Allow-Origin, so pointing
 * an anonymous <img> straight at it fails for every product — catalog empty, nothing ever
 * recognised. /api/vision/product-image resolves the URL server-side and streams it back here.
 */
function loadImage(productId) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image failed to load'))
    img.src = `/api/vision/product-image?id=${encodeURIComponent(productId)}`
  })
}

export class ProductEmbeddingStore {
  constructor() {
    this.db          = null
    this.cache       = []   // In-memory cache for fast matching
    this.coverage    = null // { withImage } from the catalog endpoint, for the HUD
  }

  /**
   * Open IndexedDB and load embeddings into memory cache.
   */
  async init() {
    this.db = await this._openDB()
    await this._loadCache()
    return this.cache.length
  }

  /**
   * Pull the shop's catalog and make sure every product with a photo has a vector in the same
   * space as the camera crops.
   *
   * @param {{ embed: (source: HTMLImageElement|HTMLCanvasElement) => Float32Array|null }} extractor
   *   Wraps whatever the pad uses on crops — passing it in is what guarantees one space.
   * @param {(done: number, total: number) => void} [onProgress]
   * @returns {Promise<number>} products available to match against
   */
  async syncFromServer(extractor = null, onProgress = null) {
    let catalog = []
    try {
      const res = await fetch('/api/vision/product-embeddings')
      if (!res.ok) {
        // This used to fail silently and leave the pad matching against nothing at all.
        console.warn(`[SKU] catalog fetch failed: HTTP ${res.status} — nothing to recognise against`)
        return this.cache.length
      }
      const body = await res.json()
      catalog = body.products ?? []
      this.coverage = body.coverage ?? null
    } catch (err) {
      console.warn('[SKU] catalog fetch failed:', err.message)
      return this.cache.length
    }

    if (!catalog.length) return this.cache.length
    if (!extractor) {
      console.warn('[SKU] no image embedder — catalog cannot be embedded, so nothing will match')
      return this.cache.length
    }

    // Only embed what is new or re-photographed; everything else is already in IndexedDB.
    const known = new Map(this.cache.map(r => [r.productId, r.imageUrl]))
    const todo = catalog.filter(p => known.get(p.id) !== p.image_url)
    if (!todo.length) return this.cache.length

    const records = []
    for (let i = 0; i < todo.length; i++) {
      const p = todo[i]
      try {
        const img = await loadImage(p.id)
        const vector = extractor.embed(img)
        if (vector?.length) {
          records.push({ productId: p.id, name: p.name, sku: p.sku, imageUrl: p.image_url, vector })
        }
      } catch (err) {
        // One unreachable image must not stop the shop's whole catalog from loading.
        console.warn(`[SKU] could not embed "${p.name}":`, err.message)
      }
      onProgress?.(i + 1, todo.length)
    }

    if (records.length) {
      const tx = this.db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      for (const r of records) store.put(r)
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej })
      await this._loadCache()
    }
    return this.cache.length
  }

  /**
   * @deprecated Use syncFromServer() instead.
   */
  async syncFromSupabase() {
    return this.syncFromServer()
  }

  /**
   * Find the best matching product for a given feature vector.
   * Uses cosine similarity — returns null if best score < threshold.
   *
   * @param {Float32Array} queryVector
   * @param {number} threshold - minimum similarity score (0-1), default 0.85
   * @returns {{ productId: string, name: string, sku: string, score: number }|null}
   */
  match(queryVector, threshold = MODEL_CONFIG.MATCH_THRESHOLD, margin = MODEL_CONFIG.MATCH_MARGIN) {
    if (!this.cache.length) return null

    let bestScore   = -1
    let bestRecord  = null
    let secondScore = -1

    for (const record of this.cache) {
      // Vectors of different lengths come from different models, and a similarity between them
      // is noise dressed up as a number. Skip rather than "match" on it.
      if (record.vector.length !== queryVector.length) continue
      const score = cosineSimilarity(queryVector, record.vector)
      if (score > bestScore) {
        secondScore = bestScore
        bestScore   = score
        bestRecord  = record
      } else if (score > secondScore) {
        secondScore = score
      }
    }

    if (!bestRecord || bestScore < threshold) return null
    // Two catalog photos this close to each other means the pad cannot actually tell them
    // apart. Claiming the winner would put a plausible-looking wrong line on the bill, which a
    // cashier has to spot to undo — refuse instead.
    if (secondScore > -1 && bestScore - secondScore < margin) return null

    return {
      productId: bestRecord.productId,
      name:      bestRecord.name,
      sku:       bestRecord.sku,
      score:     bestScore,
    }
  }

  /**
   * Store a new embedding for a product (called when product image is registered).
   * @param {string} productId
   * @param {string} name
   * @param {string} sku
   * @param {Float32Array} vector
   */
  async upsert(productId, name, sku, vector, imageUrl = null) {
    const tx    = this.db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({ productId, name, sku, vector, imageUrl })
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej })
    await this._loadCache()
  }

  async _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)

      req.onupgradeneeded = (e) => {
        const db    = e.target.result
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'productId' })
        store.createIndex('name', 'name', { unique: false })
      }

      req.onsuccess = (e) => resolve(e.target.result)
      req.onerror   = (e) => reject(e.target.error)
    })
  }

  async _loadCache() {
    return new Promise((resolve, reject) => {
      const tx    = this.db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req   = store.getAll()
      req.onsuccess = (e) => {
        this.cache = e.target.result.map(r => ({
          ...r,
          vector: r.vector instanceof Float32Array ? r.vector : new Float32Array(r.vector),
        }))
        resolve(this.cache.length)
      }
      req.onerror = (e) => reject(e.target.error)
    })
  }
}

/**
 * Cosine similarity between two Float32Arrays.
 * Returns value between -1 (opposite) and 1 (identical).
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
