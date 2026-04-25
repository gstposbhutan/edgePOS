"use client"

import { useState, useRef, useEffect } from "react"
import { Camera, Upload, Loader2, CheckCircle, XCircle, RotateCcw, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { parseBill } from "@/hooks/use-draft-purchases"

/**
 * Scan Bill modal — camera capture or file upload for wholesale bill OCR.
 *
 * @param {{
 *   open: boolean,
 *   entityId: string,
 *   createdBy: string,
 *   onDraftCreated: (draft: object) => void,
 *   onClose: () => void
 * }} props
 */
export function ScanBillModal({ open, entityId, createdBy, onDraftCreated, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileRef = useRef(null)

  const [mode, setMode] = useState('choose')   // choose | camera | processing | success | failed
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) { setMode('choose'); setError(null) }
    return () => stopCamera()
  }, [open])

  async function startCamera() {
    setMode('camera')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'environment' }
      })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
    } catch {
      setError('Camera access denied. Use file upload instead.')
      setMode('failed')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function handleCapture() {
    if (!videoRef.current) return
    setMode('processing')

    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth || 1920
    canvas.height = videoRef.current.videoHeight || 1080
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoRef.current, 0, 0)
    const base64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1]

    stopCamera()
    await processBill(base64, 'image/jpeg')
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setMode('processing')
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result
      const base64 = dataUrl.split(',')[1]
      const mimeType = file.type || 'image/jpeg'
      await processBill(base64, mimeType)
    }
    reader.readAsDataURL(file)
  }

  async function processBill(base64, mimeType) {
    try {
      const result = await parseBill(base64, mimeType, entityId, createdBy)
      setMode('success')
      setTimeout(() => {
        onDraftCreated(result.draft)
      }, 800)
    } catch (err) {
      setError(err.message || 'Bill parsing failed')
      setMode('failed')
    }
  }

  function handleClose() {
    stopCamera()
    setMode('choose')
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
    onClose()
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <div className="bg-obsidian text-white">

          <div className="px-5 pt-5 pb-3">
            <DialogTitle className="font-serif text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary shrink-0" />
              Scan Wholesale Bill
            </DialogTitle>
            <DialogDescription className="text-slate-400 mt-1">
              Photograph or upload a supplier delivery note
            </DialogDescription>
          </div>

          {/* Choose input mode */}
          {mode === 'choose' && (
            <div className="p-4 space-y-3">
              <Button onClick={startCamera}
                className="w-full bg-primary hover:bg-primary/90 text-black font-semibold h-14">
                <Camera className="mr-2 h-5 w-5" /> Use Camera
              </Button>
              <Button onClick={() => fileRef.current?.click()} variant="outline"
                className="w-full border-slate-600 text-slate-300 hover:bg-slate-800 h-14">
                <Upload className="mr-2 h-5 w-5" /> Upload Photo
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button variant="ghost" onClick={handleClose}
                className="w-full text-slate-400 hover:text-slate-300">
                Cancel
              </Button>
            </div>
          )}

          {/* Camera viewfinder */}
          {mode === 'camera' && (
            <>
              <div className="relative mx-4 rounded-xl overflow-hidden bg-slate-900" style={{ height: '280px' }}>
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-0 right-0 h-0.5 bg-primary/70 shadow-[0_0_8px_2px_rgba(212,175,55,0.4)]"
                    style={{ animation: 'scanLine 2s ease-in-out infinite' }} />
                  {[
                    'top-3 left-3 border-t-2 border-l-2',
                    'top-3 right-3 border-t-2 border-r-2',
                    'bottom-3 left-3 border-b-2 border-l-2',
                    'bottom-3 right-3 border-b-2 border-r-2',
                  ].map((cls, i) => (
                    <div key={i} className={`absolute w-6 h-6 border-primary/60 ${cls}`} />
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-400 text-center mt-3">
                Point camera at the wholesale bill
              </p>
              <style>{`
                @keyframes scanLine { 0% { top: 10% } 50% { top: 85% } 100% { top: 10% } }
              `}</style>
              <div className="flex gap-2 p-4">
                <Button variant="outline" onClick={handleClose}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800">
                  Cancel
                </Button>
                <Button onClick={handleCapture}
                  className="flex-1 bg-primary hover:bg-primary/90 text-black font-semibold">
                  <Camera className="mr-2 h-4 w-4" /> Capture
                </Button>
              </div>
            </>
          )}

          {/* Processing overlay */}
          {mode === 'processing' && (
            <div className="p-8 flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm text-slate-300">Parsing bill with AI...</p>
                <p className="text-xs text-slate-500 mt-1">Extracting products, quantities and prices</p>
              </div>
            </div>
          )}

          {/* Success */}
          {mode === 'success' && (
            <div className="p-8 flex flex-col items-center gap-3">
              <CheckCircle className="h-10 w-10 text-emerald-400" />
              <p className="text-sm font-semibold text-emerald-300">Bill scanned successfully</p>
              <p className="text-xs text-slate-400">Opening draft for review...</p>
            </div>
          )}

          {/* Failed */}
          {mode === 'failed' && (
            <div className="p-6 flex flex-col items-center gap-4">
              <XCircle className="h-10 w-10 text-red-400" />
              <div className="text-center">
                <p className="text-sm font-semibold text-red-300">Scanning failed</p>
                <p className="text-xs text-slate-400 mt-1">{error}</p>
              </div>
              <div className="flex gap-2 w-full">
                <Button variant="outline" onClick={handleClose}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800">
                  Cancel
                </Button>
                <Button onClick={() => { setMode('choose'); setError(null) }}
                  className="flex-1 bg-primary hover:bg-primary/90 text-black font-semibold">
                  <RotateCcw className="mr-2 h-4 w-4" /> Try Again
                </Button>
              </div>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  )
}
