"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSettings } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { useRequireRole } from "@/hooks/use-require-role";
import { usePlatform } from "@/hooks/use-platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Settings, Store, Save, Printer, Wifi, Server } from "lucide-react";
import { loadLabelConfig, saveLabelConfig } from "@/lib/label-config";
import { printLabel } from "@/lib/print-label";
import type { LabelConfig } from "@/lib/labels";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  useRequireRole(["owner"] as const);
  const { settings, loading, updateSettings } = useSettings();
  const { isElectron, api } = usePlatform();
  const [form, setForm] = useState({
    store_name: "",
    store_address: "",
    tpn_gstin: "",
    phone: "",
    receipt_header: "",
    receipt_footer: "",
    gst_rate: 5,
    store_entity_id: "",
  });
  const [pbUrl, setPbUrl] = useState("http://127.0.0.1:8090");
  const [syncConfig, setSyncConfig] = useState({
    remoteUrl: "",
    apiKey: "",
    intervalMinutes: 5,
    enabled: false,
  });
  const [printerStatus, setPrinterStatus] = useState<any>(null);
  const [printers, setPrinters] = useState<{ name: string; displayName: string; isDefault: boolean }[]>([]);
  const [printerForm, setPrinterForm] = useState({
    printer_device_name: "",
    printer_paper_width: 80,
    printer_auto_print: false,
    printer_copies: 1,
  });
  // Per-terminal label settings (localStorage) — lazy init so it reads once, client-side.
  const [labelCfg, setLabelCfg] = useState<LabelConfig>(() => loadLabelConfig());

  useEffect(() => {
    if (settings) {
      setForm({
        store_name: settings.store_name || "",
        store_address: settings.store_address || "",
        tpn_gstin: settings.tpn_gstin || "",
        phone: settings.phone || "",
        receipt_header: settings.receipt_header || "",
        receipt_footer: settings.receipt_footer || "",
        gst_rate: settings.gst_rate || 5,
        store_entity_id: settings.store_entity_id || "",
      });
      setPrinterForm({
        printer_device_name: settings.printer_device_name || "",
        printer_paper_width: settings.printer_paper_width || 80,
        printer_auto_print: !!settings.printer_auto_print,
        printer_copies: settings.printer_copies || 1,
      });
    }
  }, [settings]);

  useEffect(() => {
    if (isElectron && api) {
      api.printer.list().then(setPrinters);
      api.pb.getUrl().then(setPbUrl);
      api.sync.getStatus().then((s: any) => {
        if (s.config) setSyncConfig(s.config);
      });
    }
  }, [isElectron, api]);

  // Printer status depends on the configured device — re-check when settings load/change.
  useEffect(() => {
    if (isElectron && api && settings) {
      api.printer.getStatus(settings).then(setPrinterStatus);
    }
  }, [isElectron, api, settings]);

  const handleSave = async () => {
    const result = await updateSettings(form);
    if (result.success) {
      toast.success("Settings saved");
    } else {
      toast.error(result.error);
    }
  };

  const handleSavePrinter = async () => {
    const result = await updateSettings(printerForm);
    if (result.success) {
      toast.success("Printer settings saved");
      if (api) api.printer.getStatus(result.settings).then(setPrinterStatus);
    } else {
      toast.error(result.error);
    }
  };

  const handleTestPrinter = async () => {
    if (!api) return;
    // Test with the current form + store details so it reflects unsaved tweaks.
    const result = await api.printer.test({ ...settings, ...printerForm });
    if (result.success) toast.success("Test print sent");
    else toast.error(result.error);
  };

  const setLbl = (patch: Partial<LabelConfig>) =>
    setLabelCfg((c) => ({ ...c, ...patch }));

  const handleSaveLabels = () => {
    saveLabelConfig(labelCfg);
    toast.success("Label settings saved");
  };

  const handleTestLabel = () => {
    saveLabelConfig(labelCfg);
    printLabel({ name: "Sample Product", sku: "SAMPLE-001", barcode: "", mrp: 99 }, labelCfg, 1);
  };

  const handleSavePbUrl = async () => {
    if (!api) return;
    await api.pb.setUrl(pbUrl);
    toast.success("Server URL updated");
  };

  const handleToggleSync = async () => {
    if (!api) return;
    if (syncConfig.enabled) {
      await api.sync.stop();
      setSyncConfig((c) => ({ ...c, enabled: false }));
      toast.success("Sync stopped");
    } else {
      await api.sync.start(syncConfig);
      setSyncConfig((c) => ({ ...c, enabled: true }));
      toast.success("Sync started");
    }
  };

  const [bootstrapping, setBootstrapping] = useState(false);
  const handleBootstrap = async () => {
    if (!api) return;
    setBootstrapping(true);
    try {
      const r = await api.sync.bootstrap();
      if (r?.ok) toast.success(`Pulled ${r.products} products, ${r.categories} categories, ${r.khata} accounts`);
      else toast.error(r?.error || "Bootstrap failed");
    } finally {
      setBootstrapping(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              POS
            </Button>
          </Link>
          <h1 className="font-serif font-bold text-lg">Settings</h1>
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4">
        {/* Store Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Store Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Store Name</label>
                <Input
                  value={form.store_name}
                  onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                  placeholder="My Store"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone</label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+975-12345678"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Address</label>
                <Input
                  value={form.store_address}
                  onChange={(e) => setForm({ ...form, store_address: e.target.value })}
                  placeholder="Thimphu, Bhutan"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">TPN / GSTIN</label>
                <Input
                  value={form.tpn_gstin}
                  onChange={(e) => setForm({ ...form, tpn_gstin: e.target.value })}
                  placeholder="BT123456789"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">GST Rate (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.gst_rate}
                  onChange={(e) => setForm({ ...form, gst_rate: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Cloud Store ID</label>
                <Input
                  value={form.store_entity_id}
                  onChange={(e) => setForm({ ...form, store_entity_id: e.target.value })}
                  placeholder="Supabase entity UUID"
                />
                <p className="text-xs text-muted-foreground">
                  The cloud store (entity) this terminal belongs to. Sync stamps every synced order, movement, and ledger entry with it. Leave blank until provisioned.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Receipt */}
        <Card>
          <CardHeader>
            <CardTitle>Receipt Customization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Header Text</label>
              <Input
                value={form.receipt_header}
                onChange={(e) => setForm({ ...form, receipt_header: e.target.value })}
                placeholder="Optional header line"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Footer Text</label>
              <Input
                value={form.receipt_footer}
                onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
                placeholder="Thank you for your business!"
              />
            </div>
          </CardContent>
        </Card>

        {/* Server / Multi-Terminal */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              PocketBase Server
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              For multi-terminal mode, enter the IP of the computer running PocketBase.
              For single-terminal, leave as localhost.
            </p>
            <div className="flex gap-2">
              <Input
                value={pbUrl}
                onChange={(e) => setPbUrl(e.target.value)}
                placeholder="http://127.0.0.1:8090"
              />
              <Button variant="outline" onClick={handleSavePbUrl} disabled={!isElectron}>
                Save
              </Button>
            </div>
            {!isElectron && (
              <p className="text-xs text-muted-foreground">
                Server URL can only be changed in the desktop app.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Printer */}
        {isElectron && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                Thermal Printer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Prints the receipt silently to a printer installed on this computer (Windows driver). Leave the printer on &quot;System default&quot; to use the OS default.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm">Status</span>
                <Badge variant={printerStatus?.connected ? "default" : "destructive"}>
                  {printerStatus?.connected ? "Connected" : "Not Found"}
                </Badge>
              </div>
              {printerStatus?.name && (
                <p className="text-xs text-muted-foreground">{printerStatus.name}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium">Printer</label>
                  <select
                    value={printerForm.printer_device_name}
                    onChange={(e) => setPrinterForm({ ...printerForm, printer_device_name: e.target.value })}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                  >
                    <option value="">System default</option>
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.displayName}{p.isDefault ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Paper width</label>
                  <select
                    value={printerForm.printer_paper_width}
                    onChange={(e) => setPrinterForm({ ...printerForm, printer_paper_width: parseInt(e.target.value) || 80 })}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                  >
                    <option value={58}>58 mm</option>
                    <option value={80}>80 mm</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Copies</label>
                  <Input
                    type="number"
                    min={1}
                    value={printerForm.printer_copies}
                    onChange={(e) => setPrinterForm({ ...printerForm, printer_copies: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={printerForm.printer_auto_print}
                  onChange={(e) => setPrinterForm({ ...printerForm, printer_auto_print: e.target.checked })}
                />
                Auto-print receipt after each sale
              </label>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleTestPrinter}>
                  Test Print
                </Button>
                <Button size="sm" onClick={handleSavePrinter}>
                  <Save className="h-4 w-4 mr-1" /> Save printer
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Barcode Labels */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Barcode Labels
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              For the label printer at this terminal — shelf labels and weighed-goods labels at checkout.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Label width (mm)</label>
                <Input type="number" min={10}
                  value={labelCfg.width_mm}
                  onChange={(e) => setLbl({ width_mm: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Label height (mm)</label>
                <Input type="number" min={10}
                  value={labelCfg.height_mm}
                  onChange={(e) => setLbl({ height_mm: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Barcode type</label>
                <select
                  value={labelCfg.symbology}
                  onChange={(e) => setLbl({ symbology: e.target.value as LabelConfig["symbology"] })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                >
                  <option value="auto">Auto (EAN-13 if valid, else Code128)</option>
                  <option value="code128">Code128</option>
                  <option value="ean13">EAN-13</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Font size (pt)</label>
                <Input type="number" min={6} max={20}
                  value={labelCfg.font_pt}
                  onChange={(e) => setLbl({ font_pt: parseInt(e.target.value) || 9 })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Default copies</label>
                <Input type="number" min={1}
                  value={labelCfg.copies}
                  onChange={(e) => setLbl({ copies: parseInt(e.target.value) || 1 })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-primary"
                  checked={labelCfg.show_name}
                  onChange={(e) => setLbl({ show_name: e.target.checked })} /> Name
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-primary"
                  checked={labelCfg.show_mrp}
                  onChange={(e) => setLbl({ show_mrp: e.target.checked })} /> Price / MRP
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-primary"
                  checked={labelCfg.show_sku}
                  onChange={(e) => setLbl({ show_sku: e.target.checked })} /> SKU line
              </label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleTestLabel}>Test label</Button>
              <Button size="sm" onClick={handleSaveLabels}>
                <Save className="h-4 w-4 mr-1" /> Save labels
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              SKU also prints as the human-readable text under the barcode. Single-label printing (one label per page).
            </p>
          </CardContent>
        </Card>

        {/* Central Sync */}
        {isElectron && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-5 w-5" />
                Central Sync
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Push orders to a central PocketBase server for backup and multi-store reporting.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">Remote URL</label>
                <Input
                  value={syncConfig.remoteUrl}
                  onChange={(e) => setSyncConfig({ ...syncConfig, remoteUrl: e.target.value })}
                  placeholder="https://cloud.pocketbase.io"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">API Key</label>
                <Input
                  type="password"
                  value={syncConfig.apiKey}
                  onChange={(e) => setSyncConfig({ ...syncConfig, apiKey: e.target.value })}
                  placeholder="pb_api_..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Interval (minutes)</label>
                <Input
                  type="number"
                  min={1}
                  value={syncConfig.intervalMinutes}
                  onChange={(e) => setSyncConfig({ ...syncConfig, intervalMinutes: parseInt(e.target.value) || 5 })}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={syncConfig.enabled ? "destructive" : "default"}
                  onClick={handleToggleSync}
                  disabled={!syncConfig.remoteUrl}
                >
                  {syncConfig.enabled ? "Stop Sync" : "Start Sync"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleBootstrap}
                  disabled={!syncConfig.remoteUrl || !syncConfig.apiKey || bootstrapping}
                >
                  {bootstrapping ? "Pulling…" : "Pull catalog from cloud"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                First-run provisioning — pulls this store&apos;s products, categories, and credit accounts from the cloud into this terminal.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={handleSave} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            Save Settings
          </Button>
        </div>

        {/* User */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">{user?.name || user?.email}</p>
                <p className="text-sm text-muted-foreground capitalize">{user?.role}</p>
              </div>
              <Button variant="outline" onClick={signOut}>
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* System Info */}
        <Card>
          <CardHeader>
            <CardTitle>System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>PocketBase URL: {pbUrl}</p>
            <p>Mode: {isElectron ? "Desktop App" : "Browser"}</p>
            <p>Platform: {isElectron ? api?.app?.platform : "web"}</p>
            <p>Version: 1.0.0</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
