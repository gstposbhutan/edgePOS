"use client";

import { useState, useEffect } from "react";

export interface ElectronAPI {
  printer: {
    getStatus: () => Promise<{ connected: boolean; name: string }>;
    print: (order: any, settings: any) => Promise<{ success: boolean; error?: string }>;
    test: () => Promise<{ success: boolean; error?: string }>;
  };
  app: {
    getVersion: () => Promise<string>;
    platform: string;
  };
  sync: {
    getStatus: () => Promise<any>;
    start: (config: any) => Promise<boolean>;
    stop: () => Promise<boolean>;
    forceSync: () => Promise<boolean>;
  };
  pb: {
    getUrl: () => Promise<string>;
    setUrl: (url: string) => Promise<boolean>;
  };
  onSyncStatus: (callback: (data: any) => void) => () => void;
}

export function usePlatform() {
  const [isElectron, setIsElectron] = useState(false);
  const [api, setApi] = useState<ElectronAPI | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      setIsElectron(true);
      setApi((window as any).electronAPI as ElectronAPI);
    }
  }, []);

  return { isElectron, api, isWeb: !isElectron };
}
