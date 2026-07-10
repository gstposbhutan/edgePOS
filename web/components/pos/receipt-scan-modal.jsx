"use client"

import { useState, useRef, useEffect } from "react"
import { Loader2, CheckCircle, AlertTriangle, CameraIcon, RotateCcw, ScanLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { verifyPaymentScreenshot } from "@/lib/vision/payment-ocr"

/**
 * Camera capture that OCRs a bank payment-confirmation screen and extracts the journal /
 * reference number so the cashier doesn't have to type it. Extract-and-fill: the number is
 * surfaced regardless of whether the amount matches (a non-blocking hint), and the cashier
 * reviews/edits it before completing. This is a convenience, NOT payment verification.
 *
 * @param {{
 *   open: boolean,
 *   expectedAmount: number,
 *   onExtracted: (referenceNo: string, meta: { extractedAmount: number|null, amountMatches: boolean, confidence: number }) => void,
 *   onClose: () => void,
 * }} props
 */
export function ReceiptScanModal({ open, expectedAmount, onExtracted, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [phase, setPhase] = useState("scanning")   // scanning | reading | done | failed
  const [result, setResult] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) { setPhase("scanning"); setResult(null); setError(""); startCamera() }
    return () => stopCamera()
  }, [open])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" },
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      setPhase("scanning")
    } catch {
      setError("Camera unavailable — enter the journal number manually.")
      setPhase("failed")
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const amountMatches = (extracted) =>
    extracted != null && Math.abs(parseFloat(extracted) - parseFloat(expectedAmount)) < 0.5

  async function handleCapture() {
    if (!videoRef.current) return
    setPhase("reading")
    const res = await verifyPaymentScreenshot(videoRef.current, expectedAmount)
    setResult(res)
    if (res.referenceNo) {
      setPhase("done")
      stopCamera()
    } else {
      setError(res.reason || "Couldn't read a reference number. Try again or type it manually.")
      setPhase("failed")
    }
  }

  function handleRetake() {
    setResult(null); setError("")
    setPhase("scanning")
    if (!streamRef.current) startCamera()
  }

  function handleUse() {
    if (!result?.referenceNo) return
    onExtracted(result.referenceNo, {
      extractedAmount: result.extractedAmount ?? null,
      amountMatches: amountMatches(result.extractedAmount),
      confidence: result.confidence ?? 0,
    })
    handleClose()
  }

  function handleClose() {
    stopCamera()
    setPhase("scanning"); setResult(null); setError("")
    onClose()
  }

  const matched = result ? amountMatches(result.extractedAmount) : false

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className="bg-obsidian text-white">
          <div className="px-5 pt-5 pb-3">
            <DialogTitle className="font-serif text-white flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary shrink-0" />
              Scan payment receipt
            </DialogTitle>
            <DialogDescription className="text-slate-400 mt-1">
              Point the camera at the payment confirmation screen to read the journal number.
              Expected <span className="text-primary font-bold">Nu. {parseFloat(expectedAmount).toFixed(2)}</span>.
            </DialogDescription>
          </div>

          {/* Camera viewport */}
          <div className="relative mx-4 rounded-xl overflow-hidden bg-slate-900" style={{ height: "260px" }}>
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />

            {phase === "scanning" && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-0 right-0 h-0.5 bg-primary/70 shadow-[0_0_8px_2px_rgba(212,175,55,0.4)]"
                  style={{ animation: "scanLine 2s ease-in-out infinite" }} />
                {["top-3 left-3 border-t-2 border-l-2", "top-3 right-3 border-t-2 border-r-2",
                  "bottom-3 left-3 border-b-2 border-l-2", "bottom-3 right-3 border-b-2 border-r-2"].map((cls, i) => (
                  <div key={i} className={`absolute w-6 h-6 border-primary/60 ${cls}`} />
                ))}
              </div>
            )}

            {phase === "reading" && (
              <div className="absolute inset-0 bg-obsidian/80 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-slate-300">Reading receipt…</p>
              </div>
            )}

            {phase === "done" && result && (
              <div className="absolute inset-0 bg-obsidian/90 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <CheckCircle className="h-10 w-10 text-emerald-400" />
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Journal number</p>
                <p className="text-lg font-mono font-bold text-white break-all">{result.referenceNo}</p>
                {result.extractedAmount != null && (
                  <p className={`text-xs ${matched ? "text-emerald-300" : "text-amber-300"}`}>
                    {matched
                      ? `Nu. ${result.extractedAmount} matches the bill`
                      : `Found Nu. ${result.extractedAmount} — bill is Nu. ${parseFloat(expectedAmount).toFixed(2)} (please check)`}
                  </p>
                )}
                <p className="text-[10px] text-slate-500">You can edit the number after using it.</p>
              </div>
            )}

            {phase === "failed" && (
              <div className="absolute inset-0 bg-red-900/70 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <AlertTriangle className="h-9 w-9 text-red-300" />
                <p className="text-sm text-slate-200">{error}</p>
              </div>
            )}
          </div>

          {phase === "scanning" && (
            <p className="text-xs text-slate-400 text-center mt-3 px-4">
              Ask the customer to hold their confirmation screen facing the camera, then capture.
            </p>
          )}

          <style>{`@keyframes scanLine { 0% { top: 10% } 50% { top: 85% } 100% { top: 10% } }`}</style>

          {/* Actions */}
          <div className="flex gap-2 p-4">
            {phase === "scanning" && (
              <>
                <Button variant="outline" onClick={handleClose}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800">Cancel</Button>
                <Button onClick={handleCapture}
                  className="flex-1 bg-primary hover:bg-primary/90 text-black font-semibold">
                  <CameraIcon className="mr-2 h-4 w-4" /> Capture
                </Button>
              </>
            )}
            {phase === "reading" && (
              <Button disabled className="flex-1 bg-slate-700 text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading…
              </Button>
            )}
            {phase === "done" && (
              <>
                <Button variant="outline" onClick={handleRetake}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800">
                  <RotateCcw className="mr-2 h-4 w-4" /> Retake
                </Button>
                <Button onClick={handleUse}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
                  <CheckCircle className="mr-2 h-4 w-4" /> Use number
                </Button>
              </>
            )}
            {phase === "failed" && (
              <>
                <Button variant="outline" onClick={handleClose}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800">Type manually</Button>
                <Button onClick={handleRetake}
                  className="flex-1 bg-primary hover:bg-primary/90 text-black font-semibold">
                  <RotateCcw className="mr-2 h-4 w-4" /> Retry
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
