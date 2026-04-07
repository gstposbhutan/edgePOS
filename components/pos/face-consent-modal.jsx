"use client"

import { useState, useEffect, useRef } from "react"
import { Loader2, CheckCircle, Shield, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

/**
 * Face-ID Consent & Enrollment Flow
 *
 * Step 1: Show consent terms + QR code
 * Step 2: Customer scans QR → confirms on their phone (or cashier confirms on screen)
 * Step 3: Capture face embedding
 * Step 4: Link to WhatsApp number
 *
 * @param {{
 *   open: boolean,
 *   entityId: string,
 *   onEnroll: (params) => Promise<{error}>,
 *   onClose: () => void
 * }} props
 */
export function FaceConsentModal({ open, entityId, onEnroll, onClose }) {
  const [step,        setStep]        = useState(1)  // 1=consent, 2=capture, 3=link, 4=done
  const [consentToken, setConsentToken] = useState(null)
  const [embedding,   setEmbedding]   = useState(null)
  const [whatsapp,    setWhatsapp]    = useState('')
  const [name,        setName]        = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const videoRef     = useRef(null)
  const streamRef    = useRef(null)

  // Generate consent token on open
  useEffect(() => {
    if (open && step === 1) {
      const token = `CONSENT-${entityId?.slice(0,8)}-${Date.now()}`
      setConsentToken(token)
    }
  }, [open])

  // Start front camera on step 2
  useEffect(() => {
    if (step === 2) startCamera()
    return () => stopCamera()
  }, [step])

  function resetAndClose() {
    setStep(1); setEmbedding(null); setWhatsapp(''); setName(''); setError(null)
    stopCamera(); onClose()
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
    } catch {
      setError('Front camera access denied')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function handleCapture() {
    if (!videoRef.current) return
    setLoading(true)
    setError(null)

    try {
      const { FaceEngine } = await import('@/lib/vision/face-engine')
      const engine = new FaceEngine()
      await engine.init()

      // Wait a moment for stable detection
      await new Promise(r => setTimeout(r, 800))

      const result = engine.detect(videoRef.current, performance.now())
      await engine.dispose()

      if (!result) {
        setError('No face detected. Ensure you are looking directly at the camera.')
        setLoading(false)
        return
      }

      setEmbedding(result.embedding)
      stopCamera()
      setStep(3)
    } catch (err) {
      setError(`Capture failed: ${err.message}`)
    }
    setLoading(false)
  }

  async function handleEnroll() {
    setError(null)
    const cleaned = whatsapp.replace(/\s/g, '')
    if (!/^\+?[0-9]{8,15}$/.test(cleaned)) {
      setError('Enter a valid WhatsApp number')
      return
    }

    setLoading(true)
    const { error: err } = await onEnroll({
      embedding,
      whatsapp:     cleaned.startsWith('+') ? cleaned : `+${cleaned}`,
      name:         name.trim() || null,
      consentToken,
      consentAt:    new Date().toISOString(),
    })

    if (err) { setError(err); setLoading(false); return }

    setStep(4)
    setLoading(false)
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary shrink-0" />
            Face-ID Enrollment
          </DialogTitle>
          <DialogDescription>
            {step === 1 && 'Customer consent required before biometric capture'}
            {step === 2 && 'Look directly at the camera'}
            {step === 3 && 'Link your WhatsApp number'}
            {step === 4 && 'Enrollment complete'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1 — Consent */}
        {step === 1 && (
          <div className="space-y-4 mt-2">
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg space-y-2 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">By enrolling you agree to:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Your face embedding (not image) is stored for loyalty recognition</li>
                <li>Only this store can identify you using Face-ID</li>
                <li>You can request deletion at any time</li>
                <li>No raw images are ever stored</li>
              </ul>
            </div>

            <div className="p-3 bg-muted/50 border border-border rounded-lg text-center">
              <p className="text-xs text-muted-foreground mb-2">Consent Reference</p>
              <p className="text-xs font-mono text-foreground break-all">{consentToken}</p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={resetAndClose} className="flex-1">Decline</Button>
              <Button onClick={() => setStep(2)} className="flex-1 bg-primary hover:bg-primary/90">
                I Agree — Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 — Face capture */}
        {step === 2 && (
          <div className="space-y-3 mt-2">
            <div className="relative rounded-xl overflow-hidden bg-obsidian" style={{ height: '240px' }}>
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
              {/* Face guide overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-36 h-44 rounded-full border-2 border-primary/60 border-dashed" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Centre your face in the oval and hold still
            </p>
            {error && <p className="text-xs text-tibetan text-center">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetAndClose} className="flex-1">Cancel</Button>
              <Button
                onClick={handleCapture}
                disabled={loading}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Capture'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 — Link WhatsApp */}
        {step === 3 && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-700">Face captured successfully</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Name <span className="text-muted-foreground">(optional)</span></label>
              <Input placeholder="Customer name" value={name} onChange={e => setName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">WhatsApp Number <span className="text-tibetan">*</span></label>
              <Input type="tel" placeholder="+975 17 123 456" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
            </div>
            {error && <p className="text-xs text-tibetan">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Re-capture</Button>
              <Button onClick={handleEnroll} disabled={loading} className="flex-1 bg-primary hover:bg-primary/90">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enroll'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4 — Done */}
        {step === 4 && (
          <div className="space-y-4 mt-2 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Enrolled Successfully</p>
              <p className="text-xs text-muted-foreground mt-1">
                {name || whatsapp} will be recognized automatically on their next visit
              </p>
            </div>
            <div className="p-3 bg-muted/50 border border-border rounded-lg text-xs text-muted-foreground text-left space-y-1">
              <p className="flex items-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
                To delete biometric data, contact the store or request via WhatsApp
              </p>
            </div>
            <Button onClick={resetAndClose} className="w-full bg-primary hover:bg-primary/90">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
