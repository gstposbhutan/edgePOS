"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSettings } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { usePlatform } from "@/hooks/use-platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Settings, Store, Save, Printer, Wifi, Server, Shield } from "lucide-react";

export default function SettingsPage() {
  const { user, signOut, isOwner, loading: authLoading } = useAuth();
  const { settings, loading, updateSettings } = useSettings();

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  if (!isOwner) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Settings access restricted to store owners only</p>
          <Link href="/"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Back to POS</Button></Link>
        </div>
      </div>
    );
  }
  const { isElectron, api } = usePlatform();
  const [form, setForm] = useState({
    store_name: "",
    store_address: "",
    tpn_gstin: "",
    phone: "",
    receipt_header: "",
    receipt_footer: "",
    gst_rate: 5,
  });
  const [pbUrl, setPbUrl] = useState("http://127.0.0.1:8090");
  const [syncConfig, setSyncConfig] = useState({
    remoteUrl: "",
    apiKey: "",
    intervalMinutes: 5,
    enabled: false,
  });
  const [printerStatus, setPrinterStatus] = useState<any>(null);

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
      });
    }
  }, [settings]);

  useEffect(() => {
    if (isElectron && api) {
      api.printer.getStatus().then(setPrinterStatus);
      api.pb.getUrl().then(setPbUrl);
      api.sync.getStatus().then((s: any) => {
        if (s.config) setSyncConfig(s.config);
      });
    }
  }, [isElectron, api]);

  const handleSave = async () => {
    const result = await updateSettings(form);
    if (result.success) {
      toast.success("Settings saved");
    } else {
      toast.error(result.error);
    }
  };

  const handleTestPrinter = async () => {
    if (!api) return;
    const result = await api.printer.test();
    if (result.success) toast.success("Test print sent");
    else toast.error(result.error);
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
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Status</span>
                <Badge variant={printerStatus?.connected ? "default" : "destructive"}>
                  {printerStatus?.connected ? "Connected" : "Not Found"}
                </Badge>
              </div>
              {printerStatus?.name && (
                <p className="text-xs text-muted-foreground">{printerStatus.name}</p>
              )}
              <Button variant="outline" size="sm" onClick={handleTestPrinter} disabled={!printerStatus?.connected}>
                Test Print
              </Button>
            </CardContent>
          </Card>
        )}

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
              </div>
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
