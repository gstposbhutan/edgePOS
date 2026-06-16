export const metadata = {
  title: "POS — Pelbu",
}

export default function PosLayout({ children }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {children}
    </div>
  )
}
