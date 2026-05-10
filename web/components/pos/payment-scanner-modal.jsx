"use client"

import { useState, useRef, useEffect } from "react"
import { Loader2, CheckCircle, XCircle, CameraIcon, RotateCcw, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { verifyPaymentScreenshot } from "@/lib/vision/payment-ocr"

/**
 * Immersive payment screenshot verification modal.
 * Customer holds their phone showing payment confirmation to the camera.
 * Gemini 1.5 Flash Vision extracts and verifies the amount.
 *
 * @param {{
 *   open: boolean,
 *   paymentMethod: string,
 *   expectedAmount: number,
 *   onVerified: (verifyId: string, referenceNo: string) => void,
 *   onClose: () => void
 * }} props
 */
export function PaymentScannerModal({ open, paymentMethod, expectedAmount, onVerified, onClose }) {
  const videoRef   = useRef(null)
  const streamRef  = useRef(null)
  const scanLineRef = useRef(null)

  const [phase,   setPhase]   = useState('guide')   // guide|scanning|verifying|success|failed
  const [result,  setResult]  = useState(null)
  const [attempt, setAttempt] = useState(0)
  const MAX_ATTEMPTS = 3

  // Start camera when modal opens
  useEffect(() => {
    if (open) { setPhase('guide'); setResult(null); startCamera() }
    return () => stopCamera()
  }, [open])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' }
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      setPhase('scanning')
    } catch {
      setPhase('failed')
      setResult({ reason: 'Camera access denied. Cannot verify payment screenshot.' })
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function handleCapture() {
    if (!videoRef.current) return
    setPhase('verifying')

    const res = await verifyPaymentScreenshot(videoRef.current, expectedAmount)
    setResult(res)

    if (res.verified) {
      setPhase('success')
      stopCamera()
    } else {
      setPhase('failed')
      setAttempt(a => a + 1)
    }
  }

  function handleRetry() {
    setResult(null)
    setPhase('scanning')
    if (!streamRef.current) startCamera()
  }

  function handleClose() {
    stopCamera()
    setPhase('guide')
    setResult(null)
    setAttempt(0)
    onClose()
  }

  function handleAcceptVerified() {
    onVerified(result.verifyId, result.referenceNo)
    handleClose()
  }

  const methodLabel = {
    MBOB:  'mBoB',
    MPAY:  'mPay',
    RTGS:  'RTGS Bank Transfer',
  }[paymentMethod] ?? paymentMethod

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className="bg-obsidian text-white">

          {/* Header */}
          <div className="px-5 pt-5 pb-3">
            <DialogTitle className="font-serif text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary shrink-0" />
              Verify {methodLabel} Payment
            </DialogTitle>
            <DialogDescription className="text-slate-400 mt-1">
              Expected: <span className="text-primary font-bold">Nu. {parseFloat(expectedAmount).toFixed(2)}</span>
            </DialogDescription>
          </div>

          {/* Camera viewport */}
          <div className="relative mx-4 rounded-xl overflow-hidden bg-slate-900" style={{ height: '260px' }}>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              muted playsInline autoPlay
            />

            {/* Scanning line animation */}
            {phase === 'scanning' && (
              <div className="absolute inset-0 pointer-events-none">
                <div
                  ref={scanLineRef}
                  className="absolute left-0 right-0 h-0.5 bg-primary/70 shadow-[0_0_8px_2px_rgba(212,175,55,0.4)]"
                  style={{ animation: 'scanLine 2s ease-in-out infinite' }}
                />
                {/* Corner brackets */}
                {[
                  'top-3 left-3 border-t-2 border-l-2',
                  'top-3 right-3 border-t-2 border-r-2',
                  'bottom-3 left-3 border-b-2 border-l-2',
                  'bottom-3 right-3 border-b-2 border-r-2',
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-6 h-6 border-primary/60 ${cls}`} />
                ))}
              </div>
            )}

            {/* Verifying overlay */}
            {phase === 'verifying' && (
              <div className="absolute inset-0 bg-obsidian/80 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-slate-300">Gemini Vision analysing...</p>
              </div>
            )}

            {/* Success overlay */}
            {phase === 'success' && result && (
              <div className="absolute inset-0 bg-emerald-900/80 flex flex-col items-center justify-center gap-2 p-4">
                <CheckCircle className="h-12 w-12 text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-300">Payment Verified</p>
                <div className="text-center space-y-1">
                  {result.extractedAmount && (
                    <p className="text-xs text-emerald-200">Amount: Nu. {result.extractedAmount}</p>
                  )}
                  {result.referenceNo && (
                    <p className="text-xs text-slate-300 font-mono">Ref: {result.referenceNo}</p>
                  )}
                  <p className="text-[10px] text-slate-400">
                    Confidence: {Math.round((result.confidence ?? 0) * 100)}%
                  </p>
                </div>
              </div>
            )}

            {/* Failed overlay */}
            {phase === 'failed' && result && (
              <div className="absolute inset-0 bg-red-900/70 flex flex-col items-center justify-center gap-2 p-4">
                <XCircle className="h-10 w-10 text-red-400" />
                <p className="text-sm font-semibold text-red-300">Verification Failed</p>
                <p className="text-xs text-slate-300 text-center">{result.reason}</p>
                {result.extractedAmount && result.extractedAmount !== expectedAmount && (
                  <p className="text-xs text-red-300">
                    Found Nu. {result.extractedAmount} — expected Nu. {parseFloat(expectedAmount).toFixed(2)}
                  </p>
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                  Attempt {attempt}/{MAX_ATTEMPTS}
                </p>
              </div>
            )}
          </div>

          {/* Instruction */}
          {phase === 'scanning' && (
            <p className="text-xs text-slate-400 text-center mt-3 px-4">
              Ask customer to hold their {methodLabel} confirmation screen facing the camera
            </p>
          )}

          {/* Scan line CSS */}
          <style>{`
            @keyframes scanLine {
              0%   { top: 10% }
              50%  { top: 85% }
              100% { top: 10% }
            }
          `}</style>

          {/* Actions */}
          <div className="flex gap-2 p-4">
            {phase === 'scanning' && (
              <>
                <Button variant="outline" onClick={handleClose}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800">
                  Cancel
                </Button>
                <Button onClick={handleCapture}
                  className="flex-1 bg-primary hover:bg-primary/90 text-black font-semibold">
                  <CameraIcon className="mr-2 h-4 w-4" /> Capture
                </Button>
              </>
            )}

            {phase === 'verifying' && (
              <Button disabled className="flex-1 bg-slate-700 text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...
              </Button>
            )}

            {phase === 'success' && (
              <>
                <Button variant="outline" onClick={handleClose}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800">
                  Cancel
                </Button>
                <Button onClick={handleAcceptVerified}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                  <CheckCircle className="mr-2 h-4 w-4" /> Confirm Order
                </Button>
              </>
            )}

            {phase === 'failed' && (
              <>
                <Button variant="outline" onClick={handleClose}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800">
                  Cancel
                </Button>
                {attempt < MAX_ATTEMPTS ? (
                  <Button onClick={handleRetry}
                    className="flex-1 bg-primary hover:bg-primary/90 text-black font-semibold">
                    <RotateCcw className="mr-2 h-4 w-4" /> Retry ({MAX_ATTEMPTS - attempt} left)
                  </Button>
                ) : (
                  <Button onClick={handleClose}
                    className="flex-1 bg-slate-700 text-slate-300">
                    Max retries reached
                  </Button>
                )}
              </>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
