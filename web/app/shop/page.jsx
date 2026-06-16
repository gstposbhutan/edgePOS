"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Search, ShoppingBag, Store, Phone, Home, LogOut, ClipboardList, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Image from "next/image"
import Link from "next/link"
import { Logo } from "@/components/ui/logo"
import { ProductDetailModal } from "@/components/shop/product-detail-modal"
import { CartDrawer } from "@/components/shop/cart-drawer"
import { useCart } from "@/lib/cart-context"
import { getUser, signOut } from "@/lib/auth"

export default function ShopPage() {
  const router = useRouter()
  const { addToCart, itemCount, setIsOpen } = useCart()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  async function handleAddToCart(productId) {
    const result = await addToCart(productId)
    if (result.unauthorized) {
      router.push('/login?redirect=/shop')
    }
  }

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  const [search, setSearch] = useState("")
  const [products, setProducts] = useState([])
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [selectedProduct, setSelectedProduct] = useState(null)

  useEffect(() => {
    loadShopContent()
    checkAuth()
  }, [])

  async function loadShopContent() {
    setLoading(true)
    try {
      // Load products and stores from the shop API
      const res = await fetch('/api/shop/products')
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products || [])
        setStores(data.stores || [])
      }
    } catch (err) {
      console.error("Error loading shop:", err)
    } finally {
      setLoading(false)
    }
  }

  async function checkAuth() {
    const currentUser = await getUser()
    setUser(currentUser || null)
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="shrink-0">
              <Logo variant="icon" className="h-10 w-10 rounded-lg" />
            </Link>

            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-9"
              />
            </div>

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

            {user ? (
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
            ) : (
              <Link href="/login">
                <Button size="default" className="h-10">
                  <Phone className="h-4 w-4 mr-2" />
                  Login
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 py-4 space-y-6 max-w-6xl mx-auto">
        {/* Featured Stores */}
        {stores.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Shop from Local Stores</h2>
            <div className="flex gap-3 overflow-x-auto pb-4 -mx-4">
              <div className="flex gap-3 overflow-x-auto px-4">
                {stores.map((store) => (
                  <Link
                    key={store.id}
                    href={`/shop/${store.id}`}
                    className="flex-shrink-0 w-36 bg-card rounded-xl p-4 border border-border hover:border-primary/50 transition-colors"
                  >
                    <div className="h-16 w-16 mx-auto rounded-lg bg-muted/50 flex items-center justify-center mb-2">
                      <Store className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-center line-clamp-2">{store.name}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Products Grid */}
        <section>
          <h2 className="text-lg font-semibold mb-3">All Products</h2>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No products found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => setSelectedProduct(product)}
                  onAddToCart={(e) => {
                    e.stopPropagation()
                    handleAddToCart(product.id)
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          store={selectedProduct.entities}
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

        {product.entities?.name && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-background/90 backdrop-blur rounded-full text-[10px] font-medium">
            {product.entities.name}
          </div>
        )}

        {outOfStock && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
            <span className="text-sm font-semibold text-tibetan">Out of Stock</span>
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        <h3 className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">{product.name}</h3>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-primary">Nu. {price.toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">/{product.unit || "pcs"}</span>
        </div>
        {lowStock && !outOfStock && (
          <p className="text-xs text-amber-600">Only {stock} left!</p>
        )}
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
