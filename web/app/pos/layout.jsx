import { PosSidebar } from "@/components/pos/pos-sidebar"

export const metadata = {
  title: "POS — Pelbu",
}

export default function PosLayout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <PosSidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
