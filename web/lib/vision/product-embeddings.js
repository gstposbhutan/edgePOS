/**
 * Product Embedding Store
 * Manages local IndexedDB vector store for SKU matching.
 * Uses cosine similarity to match YOLO crop vectors against product embeddings.
 *
 * Flow:
 *   1. On POS load → sync embeddings from Supabase to IndexedDB
 *   2. On detection → extract crop vector → cosine match → return product
 */

import { createClient } from '@/lib/supabase/client'

const DB_NAME    = 'nexus_embeddings'
const DB_VERSION = 1
const STORE_NAME = 'product_embeddings'

/**
 * @typedef {{ productId: string, name: string, sku: string, vector: Float32Array }} EmbeddingRecord
 */

export class ProductEmbeddingStore {
  constructor() {
    this.db          = null
    this.cache       = []   // In-memory cache for fast matching
    this.supabase    = createClient()
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
   * Sync product embeddings from Supabase to IndexedDB.
   * Only downloads products with image_embedding set.
   */
  async syncFromSupabase() {
    const { data: products } = await this.supabase
      .from('products')
      .select('id, name, sku, image_embedding')
      .not('image_embedding', 'is', null)
      .eq('is_active', true)

    if (!products?.length) return 0

    const tx    = this.db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    for (const p of products) {
      // image_embedding comes as array from Supabase vector type
      const vector = new Float32Array(p.image_embedding)
      store.put({ productId: p.id, name: p.name, sku: p.sku, vector })
    }

    await new Promise((res, rej) => {
      tx.oncomplete = res
      tx.onerror    = rej
    })

    await this._loadCache()
    return this.cache.length
  }

  /**
   * Find the best matching product for a given feature vector.
   * Uses cosine similarity — returns null if best score < threshold.
   *
   * @param {Float32Array} queryVector
   * @param {number} threshold - minimum similarity score (0-1), default 0.85
   * @returns {{ productId: string, name: string, sku: string, score: number }|null}
   */
  match(queryVector, threshold = 0.85) {
    if (!this.cache.length) return null

    let bestScore  = -1
    let bestRecord = null

    for (const record of this.cache) {
      const score = cosineSimilarity(queryVector, record.vector)
      if (score > bestScore) {
        bestScore  = score
        bestRecord = record
      }
    }

    if (bestScore < threshold) return null

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
  async upsert(productId, name, sku, vector) {
    const tx    = this.db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({ productId, name, sku, vector })
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
