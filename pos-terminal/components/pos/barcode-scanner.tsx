"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanLine, X } from "lucide-react";

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

export function BarcodeScanner({ open, onClose, onScan }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const runningRef = useRef(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  const safeStop = () => {
    if (scannerRef.current && runningRef.current) {
      scannerRef.current.stop().catch(() => {});
      runningRef.current = false;
    }
  };

  // Delay scanner init until dialog animation finishes and DOM is ready
  useEffect(() => {
    if (!open) {
      setMounted(false);
      safeStop();
      scannerRef.current = null;
      return;
    }

    setError("");
    const timer = setTimeout(() => {
      const el = document.getElementById("barcode-scanner-region");
      if (!el) {
        setError("Scanner element not found");
        return;
      }
      setMounted(true);
      const scanner = new Html5Qrcode("barcode-scanner-region");
      scannerRef.current = scanner;

      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            runningRef.current = false;
            onScan(decodedText);
            scanner.stop().catch(() => {});
            onClose();
          },
          () => {}
        )
        .then(() => {
          runningRef.current = true;
        })
        .catch((err) => {
          setError("Camera access denied or not available.");
          console.error(err);
        });
    }, 200);

    return () => {
      clearTimeout(timer);
      safeStop();
      scannerRef.current = null;
    };
  }, [open, onScan, onClose]);

  useEffect(() => {
    return () => { safeStop(); };
  }, []);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            Scan Barcode / QR
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div
            id="barcode-scanner-region"
            className="w-full aspect-video rounded-lg overflow-hidden bg-black"
          />
          {error && (
            <div className="text-sm text-destructive text-center">{error}</div>
          )}
          <div className="flex justify-center">
            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
