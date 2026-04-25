import { buildWhatsAppLink } from '@/lib/marketplace'
import { createServiceClient } from '@/lib/supabase/server'

export const revalidate = 300 // 5-minute ISR

async function getStoreData(slug) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('/rest/v1', '') || 'http://localhost:3456'}/api/marketplace/${slug}`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json()
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const data = await getStoreData(slug)

  if (!data?.store) {
    return { title: 'Store not found — innovates.bt' }
  }

  return {
    title: `${data.store.name} — innovates.bt`,
    description: data.store.bio?.slice(0, 160) || `Browse products from ${data.store.name}`,
    openGraph: {
      title: data.store.name,
      description: data.store.bio?.slice(0, 160) || '',
      images: data.store.logo_url ? [data.store.logo_url] : [],
      url: `https://${slug}.innovates.bt`,
    },
  }
}

export default async function ShopPage({ params }) {
  const { slug } = await params
  let data

  try {
    const supabase = createServiceClient()

    const { data: entity } = await supabase
      .from('entities')
      .select('id, name, whatsapp_no, marketplace_bio, marketplace_logo_url, shop_slug')
      .eq('shop_slug', slug)
      .eq('is_active', true)
      .single()

    if (!entity) {
      return <NotFound />
    }

    const { data: products } = await supabase
      .from('products')
      .select('id, name, mrp, unit, image_url, product_categories(categories(id, name))')
      .eq('entity_id', entity.id)
      .eq('is_active', true)
      .eq('visible_on_web', true)
      .gt('current_stock', 0)
      .order('name')

    // Group by category
    const categoryMap = new Map()
    for (const product of (products ?? [])) {
      const cats = product.product_categories ?? []
      const catName = cats.length > 0 ? cats[0].categories?.name : 'Other'
      if (!categoryMap.has(catName)) categoryMap.set(catName, [])
      categoryMap.get(catName).push(product)
    }

    const categories = [...categoryMap.entries()]
      .sort(([a], [b]) => {
        if (a === 'Other') return 1
        if (b === 'Other') return -1
        return a.localeCompare(b)
      })

    data = {
      store: entity,
      categories,
    }
  } catch {
    return <NotFound />
  }

  if (!data?.store) return <NotFound />

  const { store, categories } = data
  const waPhone = store.whatsapp_no?.replace(/^\+/, '') ?? ''

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      {/* Store header */}
      <header className="text-center mb-16">
        {store.marketplace_logo_url && (
          <img
            src={store.marketplace_logo_url}
            alt={store.name}
            className="w-20 h-20 rounded-2xl mx-auto mb-6 object-cover"
          />
        )}
        <h1 className="text-3xl font-serif font-bold text-[#D4AF37] mb-3">
          {store.name}
        </h1>
        {store.marketplace_bio && (
          <p className="text-gray-400 text-sm max-w-md mx-auto leading-relaxed">
            {store.marketplace_bio}
          </p>
        )}
        <div className="mt-6 w-12 h-px bg-[#D4AF37]/40 mx-auto" />
      </header>

      {/* Products by category */}
      {categories.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 text-sm">No products available yet.</p>
        </div>
      ) : (
        categories.map(([categoryName, products]) => (
          <section key={categoryName} className="mb-16">
            {/* Category divider */}
            <div className="flex items-center gap-4 mb-8">
              <div className="flex-1 h-px bg-gray-800" />
              <h2 className="text-sm font-medium text-[#D4AF37]/70 uppercase tracking-widest">
                {categoryName}
              </h2>
              <div className="flex-1 h-px bg-gray-800" />
            </div>

            {/* Product cards */}
            <div className="space-y-8">
              {products.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  shopName={store.name}
                  waPhone={waPhone}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Footer */}
      <footer className="mt-20 pt-8 border-t border-gray-800 text-center">
        <p className="text-xs text-gray-600">
          Powered by <span className="text-gray-400">innovates.bt</span>
        </p>
      </footer>
    </main>
  )
}

function ProductCard({ product, shopName, waPhone }) {
  const waLink = waPhone
    ? buildWhatsAppLink(`+${waPhone}`, product.name, shopName)
    : '#'

  return (
    <article className="group">
      {/* Product image */}
      {product.image_url && (
        <div className="aspect-video rounded-xl overflow-hidden mb-4 bg-gray-900">
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        </div>
      )}

      {/* Product info */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-serif text-gray-100 truncate">
            {product.name}
          </h3>
          <p className="text-sm text-gray-400 mt-0.5">
            Nu. {parseFloat(product.mrp).toFixed(2)}
            {product.unit && product.unit !== 'pcs' && (
              <span className="text-gray-600"> / {product.unit}</span>
            )}
          </p>
        </div>

        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#D4AF37]/50 text-[#D4AF37] text-sm font-medium
                     hover:bg-[#D4AF37]/10 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Order
        </a>
      </div>
    </article>
  )
}

function NotFound() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-20 text-center">
      <h1 className="text-2xl font-serif font-bold text-[#D4AF37] mb-4">Store not found</h1>
      <p className="text-gray-500 text-sm">The store you're looking for doesn't exist or has been deactivated.</p>
    </main>
  )
}
