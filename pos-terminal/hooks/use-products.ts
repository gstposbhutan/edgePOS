"use client";

import { useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPB, PB_REQ } from "@/lib/pb-client";
import { usePosStore } from "@/stores/pos-store";

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

async function fetchProducts(): Promise<Product[]> {
  const pb = getPB();
  if (!pb.authStore.isValid) throw new Error("Not authenticated");
  return pb.collection("products").getFullList<Product>({
    sort: "name",
    filter: "is_active = true",
    expand: "category",
    requestKey: null,
  });
}

async function fetchCategories(): Promise<Category[]> {
  const pb = getPB();
  return pb.collection("categories").getFullList<Category>({
    sort: "name",
    requestKey: null,
  });
}

export function useProducts() {
  const pb = getPB();
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
    staleTime: 30 * 1000,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  });

  // Realtime subscription — invalidate on changes
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    pb.collection("products")
      .subscribe("*", () => {
        queryClient.invalidateQueries({ queryKey: ["products"] });
      })
      .then((fn) => { unsubscribe = fn; })
      .catch(() => {});
    return () => { if (unsubscribe) unsubscribe(); };
  }, [pb, queryClient]);

  // Filter state from zustand
  const searchQuery = usePosStore((s) => s.searchQuery);
  const setSearchQuery = usePosStore((s) => s.setSearchQuery);
  const selectedCategory = usePosStore((s) => s.selectedCategory);
  const setSelectedCategory = usePosStore((s) => s.setSelectedCategory);
  const selectedLetter = usePosStore((s) => s.selectedLetter);
  const setSelectedLetter = usePosStore((s) => s.setSelectedLetter);
  const stockFilter = usePosStore((s) => s.stockFilter);
  const setStockFilter = usePosStore((s) => s.setStockFilter);
  const priceMin = usePosStore((s) => s.priceMin);
  const setPriceMin = usePosStore((s) => s.setPriceMin);
  const priceMax = usePosStore((s) => s.priceMax);
  const setPriceMax = usePosStore((s) => s.setPriceMax);
  const sortField = usePosStore((s) => s.sortField);
  const setSortField = usePosStore((s) => s.setSortField);
  const sortOrder = usePosStore((s) => s.sortOrder);
  const setSortOrder = usePosStore((s) => s.setSortOrder);

  const products = productsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const findByBarcode = useCallback(
    async (barcode: string): Promise<Product | null> => {
      try {
        return await pb.collection("products").getFirstListItem<Product>(
          `barcode = "${barcode}" && is_active = true`,
          { requestKey: null }
        );
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

  const createProductMutation = useMutation({
    mutationFn: async (data: Partial<Product>) => {
      return pb.collection("products").create(data, PB_REQ);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const createProduct = useCallback(
    async (data: Partial<Product>) => {
      try {
        const record = await createProductMutation.mutateAsync(data);
        return { success: true, record };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [createProductMutation]
  );

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Product> }) => {
      return pb.collection("products").update(id, data, PB_REQ);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const updateProduct = useCallback(
    async (id: string, data: Partial<Product>) => {
      try {
        const record = await updateProductMutation.mutateAsync({ id, data });
        return { success: true, record };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
    [updateProductMutation]
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
      const matchesLetter = selectedLetter ? p.name.charAt(0).toUpperCase() === selectedLetter : true;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q);
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

  const lowStockCount = products.filter((p) => p.current_stock > 0 && p.current_stock <= p.reorder_point).length;
  const outOfStockCount = products.filter((p) => p.current_stock <= 0).length;

  return {
    products: filteredProducts,
    allProducts: products,
    categories,
    loading: productsQuery.isLoading || categoriesQuery.isLoading,
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
    refresh: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
    lowStockCount,
    outOfStockCount,
  };
}
