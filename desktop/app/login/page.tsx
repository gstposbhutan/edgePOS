"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AlertCircle, CloudDownload } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  // Whether this terminal is holding the shop's OWN logins yet. A fresh terminal pulls them
  // from the cloud when its licence is activated; if it was offline then, every sign-in here
  // fails with "Failed to authenticate" and nothing on screen says why — so ask, and say so.
  const [storeLogins, setStoreLogins] = useState<number | null>(null);
  const [pulling, setPulling] = useState(false);
  // Why the last pull failed. A cashier pressing the button and seeing the panel redraw
  // unchanged has no way to tell "no internet" from "no licence" from "it worked" — so the
  // main process reports a reason and it goes on screen.
  const [pullError, setPullError] = useState("");

  type StoreLoginsResult = {
    count: number | null;
    syncConfigured?: boolean;
    pullError?: string | null;
    error?: string;
  };

  const checkStoreLogins = async (retry = false) => {
    const api = (window as unknown as {
      electronAPI?: { auth?: { storeLogins: (o?: { retry?: boolean }) => Promise<StoreLoginsResult> } };
    }).electronAPI;
    if (!api?.auth) return;
    try {
      const res = await api.auth.storeLogins(retry ? { retry: true } : undefined);
      setStoreLogins(res?.count ?? null);
      if (retry) {
        // A pull that changed nothing is a failure the operator must see, even when no
        // exception was thrown — e.g. the cloud answered but the shop has no staff yet.
        setPullError(
          res?.pullError ||
          res?.error ||
          (!res?.count
            ? (res?.syncConfigured === false
                ? "This terminal has no licence yet, so it does not know which shop to ask."
                : "The cloud was reached but sent no staff logins. Check the shop has team members on the Pelbu website.")
            : "")
        );
      }
    } catch (e) {
      setStoreLogins(null);
      if (retry) setPullError(e instanceof Error ? e.message : "Could not reach the local database.");
    }
  };

  useEffect(() => { checkStoreLogins(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const result = await login(email, password);
    if (result.success) {
      try {
        await router.push("/");
      } catch {
        window.location.href = "/";
      }
    } else {
      setError(result.error || "Login failed");
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src="/branding/pelbu-stacked.png" alt="Pelbu" className="h-24 w-auto mx-auto mb-2" />
          <CardTitle className="sr-only">Pelbu</CardTitle>
          <CardDescription>Offline POS — GST 2026 Compliant</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@store.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            {storeLogins === 0 && (
              // Nothing the cashier types can work in this state, so say it before they try.
              <div className="space-y-2 text-sm bg-warning/10 text-warning-foreground border border-warning/30 p-3 rounded-md">
                <p className="font-medium flex items-center gap-2">
                  <CloudDownload className="h-4 w-4" />
                  This terminal has not received your staff logins yet
                </p>
                <p className="text-xs opacity-90">
                  Connect it to the internet, then get them now. Your email and password are the
                  same ones you use on the Pelbu website.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={pulling}
                  onClick={async () => {
                    setPulling(true);
                    setError("");
                    setPullError("");
                    await checkStoreLogins(true);
                    setPulling(false);
                  }}
                >
                  {pulling ? "Getting logins…" : "Get logins from the cloud"}
                </Button>
                {pullError && (
                  <p className="text-xs text-destructive break-words" data-testid="pull-error">
                    {pullError}
                  </p>
                )}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

        </CardContent>
      </Card>
    </div>
  );
}
