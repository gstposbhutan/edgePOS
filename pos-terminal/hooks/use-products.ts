"use client";

import { useState, useEffect, useCallback } from "react";
import { getPB } from "@/lib/pb-client";

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  qr_code: string;
  hsn_code: string;
  unit: string;
  mrp: number;
  cost_price: number;
  sale_price: number;
  current_stock: number;
  reorder_point: number;
  image: string;
  is_active: boolean;
  category: string;
  expand?: { category?: Category };
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export function useProducts() {
  const pb = getPB();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const records = await pb.collection("products").getFullList<Product>({
        sort: "name",
        filter: "is_active = true",
        expand: "category",
        requestKey: null,
      });
      setProducts(records);
    } catch (err) {
      console.error("Failed to fetch products:", err);
    } finally {
      setLoading(false);
    }
  }, [pb]);

  const fetchCategories = useCallback(async () => {
    try {
      const records = await pb.collection("categories").getFullList<Category>({
        sort: "name",
        requestKey: null,
      });
      setCategories(records);
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    }
  }, [pb]);

  useEffect(() => {
    fetchProducts();
    fetchCategories();

    // Re-fetch when auth becomes valid (handles Next.js keeping component in memory across redirects)
    const unsubscribeAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        fetchProducts();
        fetchCategories();
      }
    });

    // Real-time subscription
    let unsubscribe: (() => void) | null = null;
    pb.collection("products")
      .subscribe("*", () => {
        fetchProducts();
      })
      .then((fn) => {
        unsubscribe = fn;
      })
      .catch(() => {
        // Silent fail — subscription is optional for POS operation
      });

    return () => {
      unsubscribeAuth();
      if (unsubscribe) unsubscribe();
    };
  }, [pb, fetchProducts, fetchCategories]);

  const findByBarcode = useCallback(
    async (barcode: string): Promise<Product | null> => {
      try {
        const record = await pb
          .collection("products")
          .getFirstListItem<Product>(`barcode = "${barcode}" && is_active = true`);
        return record;
      } catch {
        return null;
      }
    },
    [pb]
  );

  const findById = useCallback(
    async (id: string): Promise<Product | null> => {
      try {
        return await pb.collection("products").getOne<Product>(id, { expand: "category" });
      } catch {
        return null;
      }
    },
    [pb]
  );

  const createProduct = useCallback(
    async (data: Partial<Product>) => {
      try {
        const record = await pb.collection("products").create(data);
        await fetchProducts();
        return { success: true, record };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, fetchProducts]
  );

  const updateProduct = useCallback(
    async (id: string, data: Partial<Product>) => {
      try {
        const record = await pb.collection("products").update(id, data);
        await fetchProducts();
        return { success: true, record };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, fetchProducts]
  );

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory ? p.category === selectedCategory : true;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  const lowStockCount = products.filter(
    (p) => p.current_stock > 0 && p.current_stock <= p.reorder_point
  ).length;
  const outOfStockCount = products.filter((p) => p.current_stock <= 0).length;

  return {
    products: filteredProducts,
    allProducts: products,
    categories,
    loading,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    findByBarcode,
    findById,
    createProduct,
    updateProduct,
    refresh: fetchProducts,
    lowStockCount,
    outOfStockCount,
  };
}
