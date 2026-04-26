"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSettings } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Settings, Store, Save } from "lucide-react";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { settings, loading, updateSettings } = useSettings();
  const [form, setForm] = useState({
    store_name: "",
    store_address: "",
    tpn_gstin: "",
    phone: "",
    receipt_header: "",
    receipt_footer: "",
    gst_rate: 5,
  });

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

  const handleSave = async () => {
    const result = await updateSettings(form);
    if (result.success) {
      toast.success("Settings saved");
    } else {
      toast.error(result.error);
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
            <p>PocketBase URL: {process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090"}</p>
            <p>Mode: Offline-first (local SQLite)</p>
            <p>Version: 1.0.0</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
