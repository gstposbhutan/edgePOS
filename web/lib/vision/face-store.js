/**
 * Face Profile Store
 * Manages face embedding lookup — local cache + server sync via API.
 * No raw images are stored anywhere. Vectors only.
 */

import { FaceEngine, FACE_MATCH_THRESHOLD } from './face-engine'

export class FaceStore {
  constructor() {
    this.cache    = []  // [{ id, whatsapp_no, name, embedding: Float32Array }]
  }

  /**
   * Load active face profiles for a store into memory.
   * @param {string} entityId
   */
  async loadForEntity(entityId) {
    const res = await fetch(`/api/face-profiles?entity_id=${entityId}`)
    if (!res.ok) return 0

    const { profiles } = await res.json()
    this.cache = (profiles ?? []).map(p => ({
      ...p,
      embedding: new Float32Array(p.embedding),
    }))

    return this.cache.length
  }

  /**
   * Match a live embedding vector against cached profiles.
   * @param {Float32Array} queryEmbedding
   * @returns {{ id, whatsapp_no, name, score } | null}
   */
  match(queryEmbedding) {
    let best = null
    let bestScore = FACE_MATCH_THRESHOLD

    for (const profile of this.cache) {
      const score = FaceEngine.similarity(queryEmbedding, profile.embedding)
      if (score > bestScore) {
        bestScore = score
        best      = { ...profile, score }
      }
    }

    return best
  }

  /**
   * Enroll a new face profile.
   * Requires a valid consent token — enrollment is blocked without it.
   *
   * @param {{ entityId, whatsapp, name, embedding, consentToken, consentAt }} params
   * @returns {{ error: string|null, profileId: string|null }}
   */
  async enroll({ entityId, whatsapp, name, embedding, consentToken, consentAt }) {
    try {
      const res = await fetch('/api/face-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id:     entityId,
          whatsapp_no:   whatsapp,
          name:          name ?? null,
          embedding:     Array.from(embedding),
          consent_token: consentToken,
          consent_at:    consentAt,
        }),
      })

      const data = await res.json()
      if (!res.ok) return { error: data.error || 'Enrollment failed', profileId: null }

      // Add to local cache
      this.cache.push({ id: data.profileId, whatsapp_no: whatsapp, name, embedding })
      return { error: null, profileId: data.profileId }
    } catch (err) {
      return { error: err.message, profileId: null }
    }
  }

  /**
   * GDPR deletion — zeroes embedding, marks deleted.
   * @param {string} profileId
   */
  async deleteProfile(profileId) {
    try {
      const res = await fetch(`/api/face-profiles/${profileId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        return { error: data.error || 'Deletion failed' }
      }

      this.cache = this.cache.filter(p => p.id !== profileId)
      return { error: null }
    } catch (err) {
      return { error: err.message }
    }
  }
}
