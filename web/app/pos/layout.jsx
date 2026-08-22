import { PosSidebar } from "@/components/pos/pos-sidebar"
import { getAuthContext } from "@/lib/supabase/server"
import { buildThemeCss, isDefaultTheme } from "@/lib/theme/vendor-theme"

export const metadata = {
  title: "POS — Pelbu",
}

// Per-vendor colour theme (meeting 2026-08-11). Resolved server-side and injected as a <style>
// override so the palette is already correct on first paint — no flash of the default gold.
// Vendors on the built-in default get no extra style at all.
async function vendorThemeCss() {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return null
    const { data } = await ctx.supabase
      .from("entities")
      .select("theme_preset, theme_primary")
      .eq("id", ctx.entityId)
      .single()
    if (!data || isDefaultTheme(data.theme_preset, data.theme_primary)) return null
    return buildThemeCss(data.theme_preset, data.theme_primary)
  } catch {
    return null
  }
}

export default async function PosLayout({ children }) {
  const themeCss = await vendorThemeCss()
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
      <PosSidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
