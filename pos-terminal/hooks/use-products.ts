"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  wholesale_price: number;
  entity_id?: string;
  created_by?: string;
  current_stock: number;
  reorder_point: number;
  image_url: string;
  is_active: boolean;
  category: string;
  expand?: { category?: Category };
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export type SortField = "name" | "price";
export type SortOrder = "asc" | "desc";
export type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

export function useProducts() {
  const pb = getPB();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const REQ = { requestKey: null };

  const fetchProducts = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setLoading(false);
      return;
    }
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

    const unsubscribeAuth = pb.authStore.onChange(() => {
      if (pb.authStore.isValid) {
        fetchProducts();
        fetchCategories();
      }
    });

    let unsubscribe: (() => void) | null = null;
    pb.collection("products")
      .subscribe("*", () => {
        fetchProducts();
      })
      .then((fn) => {
        unsubscribe = fn;
      })
      .catch(() => {});

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
          .getFirstListItem<Product>(`barcode = "${barcode}" && is_active = true`, { requestKey: null });
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
        return await pb.collection("products").getOne<Product>(id, { expand: "category", requestKey: null });
      } catch {
        return null;
      }
    },
    [pb]
  );

  const createProduct = useCallback(
    async (data: Partial<Product>) => {
      try {
        const record = await pb.collection("products").create(data, REQ);
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
        const record = await pb.collection("products").update(id, data, REQ);
        await fetchProducts();
        return { success: true, record };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [pb, fetchProducts]
  );

  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    products.forEach((p) => {
      const first = p.name.charAt(0).toUpperCase();
      if (/[A-Z]/.test(first)) letters.add(first);
    });
    return Array.from(letters).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    const minPrice = priceMin ? parseFloat(priceMin) : null;
    const maxPrice = priceMax ? parseFloat(priceMax) : null;

    let filtered = products.filter((p) => {
      const matchesCategory = selectedCategory ? p.category === selectedCategory : true;
      const matchesLetter = selectedLetter
        ? p.name.charAt(0).toUpperCase() === selectedLetter
        : true;

      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q);

      const price = p.sale_price || p.mrp || 0;
      const matchesPriceMin = minPrice !== null ? price >= minPrice : true;
      const matchesPriceMax = maxPrice !== null ? price <= maxPrice : true;

      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "in_stock" && p.current_stock > p.reorder_point) ||
        (stockFilter === "low_stock" && p.current_stock > 0 && p.current_stock <= p.reorder_point) ||
        (stockFilter === "out_of_stock" && p.current_stock <= 0);

      return matchesCategory && matchesLetter && matchesSearch && matchesPriceMin && matchesPriceMax && matchesStock;
    });

    filtered.sort((a, b) => {
      const aPrice = a.sale_price || a.mrp || 0;
      const bPrice = b.sale_price || b.mrp || 0;
      if (sortField === "name") {
        return sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      return sortOrder === "asc" ? aPrice - bPrice : bPrice - aPrice;
    });

    return filtered;
  }, [products, searchQuery, selectedCategory, selectedLetter, priceMin, priceMax, stockFilter, sortField, sortOrder]);

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
    selectedLetter,
    setSelectedLetter,
    availableLetters,
    stockFilter,
    setStockFilter,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    findByBarcode,
    findById,
    createProduct,
    updateProduct,
    refresh: fetchProducts,
    lowStockCount,
    outOfStockCount,
  };
}
