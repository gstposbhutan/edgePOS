"use client"

import { useState, useEffect } from "react"
import { Search, ShoppingBag, Store, User, Menu, Phone, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@supabase/supabase-js"
import Image from "next/image"
import Link from "next/link"
import { ProductDetailModal } from "@/components/product-detail-modal"

export default function MarketplacePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const [search, setSearch] = useState("")
  const [activeCategory, setActiveCategory] = useState("all")
  const [products, setProducts] = useState([])
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [cartCount, setCartCount] = useState(0)
  const [user, setUser] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)

  useEffect(() => {
    loadFeaturedContent()
    checkAuth()
  }, [])

  async function loadFeaturedContent() {
    setLoading(true)
    try {
      // Load featured products with store info
      const { data: productsData } = await supabase
        .from("products")
        .select(`
          id, name, mrp, image_url, unit, current_stock, sku, hsn_code,
          manufacturer, batch_no, expiry_date, package_contents, vendor_notes,
          category_name, specifications,
          entities!inner(id, name, shop_slug, tpn_gstin)
        `)
        .eq("is_active", true)
        .eq("visible_on_web", true)
        .gt("current_stock", 0)
        .order("name")
        .limit(20)

      // Load active stores/retailers
      const { data: storesData } = await supabase
        .from("entities")
        .select("id, name, shop_slug, whatsapp_no, address, tpn_gstin")
        .eq("role", "RETAILER")
        .eq("is_active", true)
        .order("name")

      setProducts(productsData || [])
      setStores(storesData || [])
    } catch (err) {
      console.error("Error loading marketplace:", err)
    } finally {
      setLoading(false)
    }
  }

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user || null)
  }

  const categories = [
    { id: "all", name: "All", icon: "🏪" },
    { id: "food", name: "Food", icon: "🍜" },
    { id: "beverages", name: "Beverages", icon: "🥤" },
    { id: "electronics", name: "Electronics", icon: "📱" },
    { id: "personal", name: "Personal Care", icon: "🧴" },
    { id: "household", name: "Household", icon: "🏠" },
  ]

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Mobile Header - Sticky */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-xl">🏔️</span>
            </div>

            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products or stores..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-9 pr-10"
              />
              {/* Cart Button */}
              <Button
                variant="ghost"
                size="icon"
                className="relative h-10 w-10"
                onClick={() => {/* TODO: Open cart */}}
              >
                <ShoppingBag className="h-5 w-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-tibetan text-[10px] font-bold flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </Button>

              {/* User Menu */}
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() => {/* TODO: Open user menu */}}
              >
                {user ? <User className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Category Pills - Horizontal Scroll */}
        <div className="px-4 py-2 overflow-x-auto scrollbar-hide -mx-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <span className="text-lg">{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 py-4 space-y-6">
        {/* Featured Stores Section */}
        {stores.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Featured Stores</h2>
            <div className="flex gap-3 overflow-x-auto pb-4 -mx-4">
              <div className="flex gap-3 overflow-x-auto px-4">
                {stores.map((store) => (
                  <Link
                    key={store.id}
                    href={`/shop/${store.shop_slug}`}
                    className="flex-shrink-0 w-32 bg-card rounded-xl p-4 border border-border hover:border-primary/50 transition-colors"
                  >
                    <div className="h-16 w-16 mx-auto rounded-lg bg-muted/50 flex items-center justify-center mb-2">
                      <Store className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-center line-clamp-2">{store.name}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-2 text-xs"
                      onClick={(e) => e.preventDefault()}
                    >
                      Visit
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Products Grid */}
        <section>
          <h2 className="text-lg font-semibold mb-3">
            {activeCategory === "all" ? "All Products" : categories.find((c) => c.id === activeCategory)?.name}
          </h2>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No products found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => setSelectedProduct(product)}
                  onAddToCart={(e) => {
                    e.stopPropagation()
                    setCartCount(cartCount + 1)
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Bottom Navigation - Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border z-50">
        <div className="flex justify-around px-2 py-2 max-w-lg mx-auto">
          <NavItem icon={<Home className="h-5 w-5" />} label="Home" active />
          <NavItem icon={<Search className="h-5 w-5" />} label="Search" />
          <NavItem icon={<Store className="h-5 w-5" />} label="Stores" />
          <NavItem
            icon={<ShoppingBag className="h-5 w-5" />}
            label="Cart"
            badge={cartCount > 0 ? cartCount : undefined}
          />
          <NavItem icon={user ? <User className="h-5 w-5" /> : <Phone className="h-5 w-5" />} label={user ? "Profile" : "Login"} />
        </div>
      </nav>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          store={selectedProduct.entities}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={() => {
            setCartCount(cartCount + 1)
            setSelectedProduct(null)
          }}
        />
      )}
    </div>
  )
}

function NavItem({ icon, label, active, badge }) {
  return (
    <button className="flex flex-col items-center gap-0.5 text-xs min-w-[48px]">
      <div className="relative">
        {icon}
        {badge && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-tibetan text-[10px] font-bold flex items-center justify-center">
            {badge}
          </span>
        )}
      </div>
      <span className={active ? "text-foreground font-medium" : "text-muted-foreground"}>
        {label}
      </span>
    </button>
  )
}

function ProductCard({ product, onClick, onAddToCart }) {
  const price = parseFloat(product.mrp ?? 0)
  const stock = product.current_stock ?? 0
  const lowStock = stock <= 10
  const outOfStock = stock <= 0

  return (
    <div
      onClick={onClick}
      className="bg-card rounded-xl overflow-hidden border border-border shadow-sm cursor-pointer hover:border-primary/50 transition-colors"
    >
      {/* Product Image */}
      <div className="aspect-square relative bg-muted">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}

        {/* Store Badge */}
        {product.entities?.shop_slug && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-background/90 backdrop-blur rounded-full text-[10px] font-medium">
            {product.entities.name}
          </div>
        )}

        {/* Out of Stock Overlay */}
        {outOfStock && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
            <span className="text-sm font-semibold text-tibetan">Out of Stock</span>
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="p-3 space-y-2">
        <h3 className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">{product.name}</h3>

        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-primary">Nu. {price.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">/{product.unit || "pcs"}</span>
        </div>

        {/* Stock Status */}
        {lowStock && !outOfStock && (
          <p className="text-xs text-amber-600">Only {stock} left!</p>
        )}

        {/* Add to Cart Button */}
        <Button
          size="sm"
          onClick={onAddToCart}
          disabled={outOfStock}
          className="w-full bg-primary hover:bg-primary/90 text-sm"
        >
          {outOfStock ? "Out of Stock" : "Add to Cart"}
        </Button>
      </div>
    </div>
  )
}
