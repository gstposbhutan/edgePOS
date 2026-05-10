/**
 * Face Profile Store
 * Manages face embedding lookup — local cache + Supabase sync.
 * No raw images are stored anywhere. Vectors only.
 */

import { createClient }    from '@/lib/supabase/client'
import { FaceEngine, FACE_MATCH_THRESHOLD } from './face-engine'

export class FaceStore {
  constructor() {
    this.supabase = createClient()
    this.cache    = []  // [{ id, whatsapp_no, name, embedding: Float32Array }]
  }

  /**
   * Load active face profiles for a store into memory.
   * @param {string} entityId
   */
  async loadForEntity(entityId) {
    const { data } = await this.supabase
      .from('face_profiles')
      .select('id, whatsapp_no, name, embedding')
      .eq('entity_id', entityId)
      .is('deleted_at', null)
      .not('embedding', 'is', null)

    this.cache = (data ?? []).map(p => ({
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
    const { data, error } = await this.supabase
      .from('face_profiles')
      .insert({
        entity_id:     entityId,
        whatsapp_no:   whatsapp,
        name:          name ?? null,
        embedding:     Array.from(embedding),
        consent_at:    consentAt,
        consent_token: consentToken,
      })
      .select('id')
      .single()

    if (error) return { error: error.message, profileId: null }

    // Add to local cache
    this.cache.push({ id: data.id, whatsapp_no: whatsapp, name, embedding })
    return { error: null, profileId: data.id }
  }

  /**
   * GDPR deletion — zeroes embedding, marks deleted.
   * @param {string} profileId
   */
  async deleteProfile(profileId) {
    const { error } = await this.supabase.rpc('delete_face_profile', {
      p_profile_id: profileId,
    })

    if (!error) {
      this.cache = this.cache.filter(p => p.id !== profileId)
    }

    return { error: error?.message ?? null }
  }
}
