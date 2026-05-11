"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Search, ShoppingBag, Store, Phone, ArrowLeft, LogOut, ClipboardList, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import Image from "next/image"
import Link from "next/link"
import { ProductDetailModal } from "@/components/shop/product-detail-modal"
import { CartDrawer } from "@/components/shop/cart-drawer"
import { useCart } from "@/lib/cart-context"

export default function StoreDetailPage() {
  const params = useParams()
  const storeId = params.id

  const supabase = createClient()
  const router = useRouter()
  const { addToCart, itemCount, setIsOpen } = useCart()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleAddToCart(productId) {
    const result = await addToCart(productId)
    if (result.unauthorized) {
      router.push(`/login?redirect=/shop/${storeId}`)
    }
  }

  const [search, setSearch] = useState("")
  const [store, setStore] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState(null)

  useEffect(() => {
    if (storeId) {
      loadStoreData()
    }
  }, [storeId])

  async function loadStoreData() {
    setLoading(true)
    try {
      // Load store details
      const { data: storeData } = await supabase
        .from("entities")
        .select("*")
        .eq("id", storeId)
        .eq("is_active", true)
        .single()

      if (storeData) {
        setStore(storeData)

        // Load store's products using created_by
        const { data: productsData } = await supabase
          .from("products")
          .select("*")
          .eq("created_by", storeId)
          .eq("is_active", true)
          .gt("current_stock", 0)
          .order("name")

        setProducts(productsData || [])
      }
    } catch (err) {
      console.error("Error loading store:", err)
    } finally {
      setLoading(false)
    }
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 rounded-full bg-muted animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">Loading store...</p>
        </div>
      </div>
    )
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center">
          <Store className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Store Not Found</h1>
          <p className="text-muted-foreground mb-6">This store may be inactive or doesn't exist.</p>
          <Link href="/shop">
            <Button>Browse All Stores</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/shop">
              <Button variant="ghost" size="icon" className="h-10 w-10">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>

            {/* Search Bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${store.name}...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-9"
              />
            </div>

            {/* Cart Button */}
            <Button
              variant="ghost"
              size="icon"
              className="relative h-10 w-10"
              onClick={() => setIsOpen(true)}
            >
              <ShoppingBag className="h-5 w-5" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-tibetan text-[10px] font-bold flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </Button>

            {/* User dropdown */}
            <div className="relative" ref={menuRef}>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() => setMenuOpen(v => !v)}
              >
                <User className="h-5 w-5" />
              </Button>
              {menuOpen && (
                <div className="absolute right-0 top-12 w-44 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                  <Link
                    href="/shop/orders"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-muted/50 transition-colors"
                  >
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    My Orders
                  </Link>
                  <div className="border-t border-border" />
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-tibetan hover:bg-tibetan/5 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Store Info Banner */}
      <div className="bg-gradient-to-br from-primary/20 to-primary/5 border-b border-border">
        <div className="px-4 py-6">
          <div className="flex items-start gap-4">
            <div className="h-20 w-20 rounded-xl bg-background flex items-center justify-center shadow-sm">
              <Store className="h-10 w-10 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold mb-1">{store.name}</h1>
              {store.tpn_gstin && (
                <p className="text-sm text-muted-foreground mb-2">TPN: {store.tpn_gstin}</p>
              )}
              {store.whatsapp_no && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{store.whatsapp_no}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <main className="px-4 py-4">
        <h2 className="text-lg font-semibold mb-4">
          Products {search && `(${filteredProducts.length} found)`}
        </h2>

        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {search ? "No products match your search" : "No products available"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                store={store}
                onClick={() => setSelectedProduct(product)}
                onAddToCart={(e) => {
                  e.stopPropagation()
                  handleAddToCart(product.id)
                }}
              />
            ))}
          </div>
        )}
      </main>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          store={store}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={() => {
            handleAddToCart(selectedProduct.id)
            setSelectedProduct(null)
          }}
        />
      )}

      {/* Cart Drawer */}
      <CartDrawer />
    </div>
  )
}

function ProductCard({ product, store, onClick, onAddToCart }) {
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
        <div className="absolute top-2 left-2 px-2 py-1 bg-background/90 backdrop-blur rounded-full text-[10px] font-medium">
          {store?.name}
        </div>

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
