"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, CheckCircle, AlertTriangle, Camera, RotateCcw, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Extracted-value metadata handed back to the caller alongside the journal number.
export interface ScanMeta {
  extractedAmount: number | null;
  amountMatches: boolean;
  confidence: number;
}

interface ReceiptScanModalProps {
  open: boolean;
  expectedAmount: number;
  onExtracted: (referenceNo: string, meta: ScanMeta) => void;
  onClose: () => void;
}

interface ExtractResult {
  ok?: boolean;
  error?: string;
  referenceNo?: string | null;
  extractedAmount?: number | null;
  confidence?: number;
  reason?: string;
}

function getPaymentApi(): { extractJournal: (p: unknown) => Promise<ExtractResult> } | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { electronAPI?: { payment?: { extractJournal: (p: unknown) => Promise<ExtractResult> } } })
    .electronAPI?.payment ?? null;
}

type Phase = "scanning" | "reading" | "done" | "failed";

/**
 * Camera capture that OCRs a bank payment-confirmation screen and extracts the journal /
 * reference number so the cashier doesn't retype it. The terminal relays the frame to the CLOUD
 * OCR endpoint via IPC (payment:extract-journal) — offline it fails gracefully to manual entry.
 * Extract-and-fill: the number is surfaced regardless of amount match; the cashier reviews it.
 */
export function ReceiptScanModal({ open, expectedAmount, onExtracted, onClose }: ReceiptScanModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>("scanning");
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setPhase("scanning");
    } catch {
      setError("Camera unavailable — enter the journal number manually.");
      setPhase("failed");
    }
  }, []);

  useEffect(() => {
    if (open) { setPhase("scanning"); setResult(null); setError(""); startCamera(); }
    return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  const amountMatches = (extracted: number | null | undefined) =>
    extracted != null && Math.abs(Number(extracted) - Number(expectedAmount)) < 0.5;

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video) return;
    const api = getPaymentApi();
    if (!api) {
      setError("Receipt scanning is only available in the desktop app — enter the number manually.");
      setPhase("failed");
      return;
    }
    setPhase("reading");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.92).split(",")[1];

    try {
      const res = await api.extractJournal({ imageBase64, mimeType: "image/jpeg", expectedAmount });
      setResult(res);
      if (res.ok && res.referenceNo) {
        setPhase("done");
        stopCamera();
      } else {
        setError(res.error || res.reason || "Couldn't read a reference number. Try again or type it manually.");
        setPhase("failed");
      }
    } catch {
      setError("Couldn't reach the server — enter the journal number manually.");
      setPhase("failed");
    }
  };

  const handleRetake = () => {
    setResult(null); setError("");
    setPhase("scanning");
    if (!streamRef.current) startCamera();
  };

  const handleClose = () => {
    stopCamera();
    setPhase("scanning"); setResult(null); setError("");
    onClose();
  };

  const handleUse = () => {
    if (!result?.referenceNo) return;
    onExtracted(result.referenceNo, {
      extractedAmount: result.extractedAmount ?? null,
      amountMatches: amountMatches(result.extractedAmount),
      confidence: result.confidence ?? 0,
    });
    handleClose();
  };

  const matched = result ? amountMatches(result.extractedAmount) : false;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            Scan payment receipt
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Point the camera at the customer&apos;s payment confirmation to read the journal number.
            Expected <span className="text-primary font-semibold">Nu. {Number(expectedAmount).toFixed(2)}</span>.
          </p>

          <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />

            {phase === "reading" && (
              <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-2">
                <Loader2 className="h-9 w-9 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Reading receipt…</p>
              </div>
            )}

            {phase === "done" && result && (
              <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center gap-1.5 p-4 text-center">
                <CheckCircle className="h-9 w-9 text-emerald-500" />
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Journal number</p>
                <p className="text-lg font-mono font-bold break-all">{result.referenceNo}</p>
                {result.extractedAmount != null && (
                  <p className={`text-xs ${matched ? "text-emerald-500" : "text-amber-500"}`}>
                    {matched
                      ? `Nu. ${result.extractedAmount} matches the bill`
                      : `Found Nu. ${result.extractedAmount} — bill is Nu. ${Number(expectedAmount).toFixed(2)} (please check)`}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">You can edit the number after using it.</p>
              </div>
            )}

            {phase === "failed" && (
              <div className="absolute inset-0 bg-destructive/70 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <AlertTriangle className="h-8 w-8 text-white" />
                <p className="text-sm text-white">{error}</p>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {phase === "scanning" && (
              <>
                <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
                <Button className="flex-1" onClick={handleCapture}>
                  <Camera className="h-4 w-4 mr-2" /> Capture
                </Button>
              </>
            )}
            {phase === "reading" && (
              <Button disabled className="flex-1">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Reading…
              </Button>
            )}
            {phase === "done" && (
              <>
                <Button variant="outline" className="flex-1" onClick={handleRetake}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Retake
                </Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleUse}>
                  <CheckCircle className="h-4 w-4 mr-2" /> Use number
                </Button>
              </>
            )}
            {phase === "failed" && (
              <>
                <Button variant="outline" className="flex-1" onClick={handleClose}>Type manually</Button>
                <Button className="flex-1" onClick={handleRetake}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Retry
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
