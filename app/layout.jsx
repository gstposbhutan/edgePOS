import { Geist, Geist_Mono } from "next/font/google";
import { ConnectivityGate } from "@/components/connectivity-gate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "NEXUS BHUTAN — 4K Edge-AI POS",
  description: "Royal Bhutan's 4K Edge-AI POS & Multi-Tier Supply Chain Ecosystem for GST 2026 Compliance",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ConnectivityGate>{children}</ConnectivityGate>
      </body>
    </html>
  );
}
