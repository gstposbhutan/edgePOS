import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/providers/query-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { UpdateBanner } from "@/components/update-banner";
import { SyncNudge } from "@/components/sync-nudge";
import { OfficeChrome } from "@/components/office/office-chrome";

export const metadata: Metadata = {
  title: "Pelbu POS",
  description: "Offline-first GST POS for Bhutan",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="h-full flex flex-col overflow-hidden bg-background text-foreground">
        <ThemeProvider>
          <QueryProvider>
            <UpdateBanner />
            <SyncNudge />
            <OfficeChrome />
            {children}
          </QueryProvider>
        </ThemeProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
