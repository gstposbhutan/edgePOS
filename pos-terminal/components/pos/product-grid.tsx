"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  ScanLine,
  Package,
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  SlidersHorizontal,
  X,
  Grid3X3,
  List,
  Star,
} from "lucide-react";
import { ProductImage } from "./product-image";
import { usePos } from "@/hooks/use-pos-context";
import type { Product, Category, StockFilter, SortField, SortOrder } from "@/hooks/use-products";

interface ProductGridProps {
  onAddProduct: (product: Product) => void;
  onScan: () => void;
  highlightedIndex: number;
  setHighlightedIndex: (i: number) => void;
}

const STOCK_OPTIONS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "All Stock" },
  { value: "in_stock", label: "In Stock" },
  { value: "low_stock", label: "Low Stock" },
  { value: "out_of_stock", label: "Out of Stock" },
];

export function ProductGrid({
  onAddProduct,
  onScan,
  highlightedIndex,
  setHighlightedIndex,
}: ProductGridProps) {
  const pos = usePos();
  if (!pos) return <div className="flex-1" />;
  const { products: posData, favorites: favObj } = pos;
  const { products, categories, loading, searchQuery, setSearchQuery, selectedCategory, setSelectedCategory, selectedLetter, setSelectedLetter, availableLetters, stockFilter, setStockFilter, priceMin, setPriceMin, priceMax, setPriceMax, sortField, setSortField, sortOrder, setSortOrder } = posData;
  const { favorites, toggleFavorite, isFavorite } = favObj;
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [tapFeedback, setTapFeedback] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const hasActiveFilters =
    selectedLetter !== null ||
    stockFilter !== "all" ||
    priceMin !== "" ||
    priceMax !== "";

  const clearFilters = () => {
    setSelectedLetter(null);
    setStockFilter("all");
    setPriceMin("");
    setPriceMax("");
  };

  const displayProducts = showFavorites
    ? products.filter((p) => favorites.includes(p.id))
    : products;

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery, selectedCategory, showFavorites, setHighlightedIndex]);

  const handleAddWithFeedback = useCallback(
    (product: Product) => {
      onAddProduct(product);
      setTapFeedback(product.id);
      setTimeout(() => setTapFeedback(null), 600);
    },
    [onAddProduct]
  );

  const favoriteProducts = products.filter((p) => favorites.includes(p.id));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border space-y-2 shrink-0">
        {/* Search row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Type to search products... (auto-active)"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              className="pl-9 h-10"
              id="pos-search"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="icon"
            className="h-10 w-10"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-10 w-10" onClick={onScan}>
            <ScanLine className="h-4 w-4" />
          </Button>
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={`p-2.5 transition-colors ${view === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-2.5 transition-colors ${view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Category tabs + Favorites */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {favoriteProducts.length > 0 && (
            <Button
              variant={showFavorites ? "default" : "outline"}
              size="sm"
              onClick={() => { setShowFavorites(!showFavorites); setSelectedCategory(null); }}
              className={`shrink-0 min-h-[2.25rem] ${showFavorites ? "" : "border-warning/30 text-warning hover:bg-warning/10"}`}
            >
              <Star className="h-3.5 w-3.5 mr-1 fill-current" />
              Favorites
            </Button>
          )}
          <Button
            variant={selectedCategory === null && !showFavorites ? "default" : "outline"}
            size="sm"
            onClick={() => { setSelectedCategory(null); setShowFavorites(false); }}
            className="shrink-0 min-h-[2.25rem]"
          >
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id && !showFavorites ? "default" : "outline"}
              size="sm"
              onClick={() => { setSelectedCategory(cat.id); setShowFavorites(false); }}
              className="shrink-0 min-h-[2.25rem]"
              style={
                selectedCategory === cat.id && !showFavorites
                  ? undefined
                  : { borderColor: `${cat.color}40` }
              }
            >
              <span
                className="w-2 h-2 rounded-full mr-1.5"
                style={{ backgroundColor: cat.color }}
              />
              {cat.name}
            </Button>
          ))}
        </div>

        {/* A-Z Filter */}
        <div className="flex gap-0.5 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSelectedLetter(null)}
            className={`shrink-0 w-8 h-8 rounded text-xs font-medium transition-colors flex items-center justify-center ${
              selectedLetter === null
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-muted-foreground"
            }`}
          >
            #
          </button>
          {availableLetters.map((letter) => (
            <button
              key={letter}
              onClick={() => setSelectedLetter(selectedLetter === letter ? null : letter)}
              className={`shrink-0 w-8 h-8 rounded text-xs font-medium transition-colors flex items-center justify-center ${
                selectedLetter === letter
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              {letter}
            </button>
          ))}
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Filters
              </span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-primary hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {STOCK_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={stockFilter === opt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStockFilter(opt.value)}
                  className="text-xs min-h-[2.25rem]"
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Price:</span>
              <Input
                type="number"
                placeholder="Min"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                className="h-8 text-xs w-20"
              />
              <span className="text-xs text-muted-foreground">—</span>
              <Input
                type="number"
                placeholder="Max"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                className="h-8 text-xs w-20"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Sort:</span>
              <Button
                variant={sortField === "name" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (sortField === "name") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortField("name");
                    setSortOrder("asc");
                  }
                }}
                className="text-xs min-h-[2.25rem]"
              >
                {sortField === "name" && sortOrder === "asc" && (
                  <ArrowDownAZ className="h-3 w-3 mr-1" />
                )}
                {sortField === "name" && sortOrder === "desc" && (
                  <ArrowUpAZ className="h-3 w-3 mr-1" />
                )}
                Name
              </Button>
              <Button
                variant={sortField === "price" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  if (sortField === "price") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortField("price");
                    setSortOrder("asc");
                  }
                }}
                className="text-xs min-h-[2.25rem]"
              >
                {sortField === "price" && sortOrder === "asc" && (
                  <ArrowDownWideNarrow className="h-3 w-3 mr-1" />
                )}
                {sortField === "price" && sortOrder === "desc" && (
                  <ArrowUpWideNarrow className="h-3 w-3 mr-1" />
                )}
                Price
              </Button>
            </div>

            {hasActiveFilters && (
              <div className="flex flex-wrap gap-1">
                {selectedLetter && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    A-Z: {selectedLetter}
                    <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setSelectedLetter(null)} />
                  </Badge>
                )}
                {stockFilter !== "all" && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    {STOCK_OPTIONS.find((o) => o.value === stockFilter)?.label}
                    <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setStockFilter("all")} />
                  </Badge>
                )}
                {priceMin && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    Min Nu.{priceMin}
                    <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setPriceMin("")} />
                  </Badge>
                )}
                {priceMax && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    Max Nu.{priceMax}
                    <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setPriceMax("")} />
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Product count */}
      <div className="px-4 py-1.5 text-xs text-muted-foreground border-b border-border/50 flex items-center justify-between">
        <span>{displayProducts.length} product{displayProducts.length !== 1 ? "s" : ""}</span>
        {showFavorites && (
          <Badge variant="outline" className="text-[10px] border-warning/30 text-warning">
            <Star className="h-2.5 w-2.5 mr-0.5 fill-current" />
            Favorites
          </Badge>
        )}
      </div>

      {/* Products */}
      <div className="flex-1 overflow-y-auto p-4" ref={gridRef}>
        {loading ? (
          <div className="text-center text-muted-foreground py-12">
            <div className="animate-pulse">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Loading products...</p>
            </div>
          </div>
        ) : displayProducts.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No products found</p>
            <p className="text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {displayProducts.map((product, idx) => {
              const category = categories.find((c) => c.id === product.category);
              const catColor = category?.color || "#6b7280";
              const isOutOfStock = product.current_stock <= 0;
              const isLowStock = product.current_stock > 0 && product.current_stock <= product.reorder_point;
              const isHighlighted = idx === highlightedIndex;
              const isFav = isFavorite(product.id);

              return (
                <button
                  key={product.id}
                  onClick={() => handleAddWithFeedback(product)}
                  disabled={isOutOfStock}
                  className={`product-card group relative text-left rounded-xl border overflow-hidden transition-all duration-150 hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none bg-card active:scale-[0.97] ${
                    isHighlighted
                      ? "border-primary ring-2 ring-primary/50"
                      : isOutOfStock
                      ? "border-destructive/30"
                      : "border-border hover:border-primary/50"
                  } ${tapFeedback === product.id ? "ring-2 ring-emerald-400" : ""}`}
                >
                  {/* Favorites star */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(product.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        toggleFavorite(product.id);
                      }
                    }}
                    className={`absolute top-2 left-2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      isFav
                        ? "bg-warning/20 text-warning"
                        : "bg-black/20 text-white/60 opacity-0 group-hover:opacity-100 hover:!opacity-100"
                    }`}
                  >
                    <Star className={`h-3.5 w-3.5 ${isFav ? "fill-current" : ""}`} />
                  </span>

                  {/* Stock badge */}
                  <div className="absolute top-2 right-2 z-10 flex gap-1">
                    {isOutOfStock && (
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                        OUT
                      </Badge>
                    )}
                    {isLowStock && (
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 h-4 border-warning text-warning"
                      >
                        LOW
                      </Badge>
                    )}
                  </div>

                  {/* Image */}
                  <div className={`aspect-square bg-muted overflow-hidden ${isOutOfStock ? "grayscale" : ""}`}>
                    <ProductImage product={product} category={category} />
                  </div>

                  {/* Info */}
                  <div className="p-2.5 space-y-1">
                    <h3 className="font-medium text-sm line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                      {product.name}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: catColor }}
                      />
                      <span className="text-[10px] text-muted-foreground truncate">
                        {category?.name || "Uncategorized"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-primary tabular-nums">
                        Nu. {(product.sale_price || product.mrp || 0).toFixed(0)}
                      </p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {product.current_stock} {product.unit || "pcs"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {displayProducts.map((product, idx) => {
              const category = categories.find((c) => c.id === product.category);
              const catColor = category?.color || "#6b7280";
              const isOutOfStock = product.current_stock <= 0;
              const isHighlighted = idx === highlightedIndex;
              const isFav = isFavorite(product.id);

              return (
                <button
                  key={product.id}
                  onClick={() => handleAddWithFeedback(product)}
                  disabled={isOutOfStock}
                  className={`w-full text-left rounded-lg border-2 p-3 transition-all hover:border-primary/50 hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 ${
                    isHighlighted
                      ? "border-primary bg-primary/5 ring-1 ring-primary/50"
                      : isOutOfStock
                      ? "border-destructive/30"
                      : "border-border"
                  }`}
                >
                  <div className={`w-11 h-11 rounded-md bg-muted overflow-hidden shrink-0 ${isOutOfStock ? "grayscale" : ""}`}>
                    <ProductImage product={product} category={category} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: catColor }}
                      />
                      <h3 className="font-medium text-sm truncate">{product.name}</h3>
                      {isFav && <Star className="h-3 w-3 fill-warning text-warning shrink-0" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      SKU: {product.sku} · Stock: {product.current_stock}
                    </p>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(product.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        toggleFavorite(product.id);
                      }
                    }}
                    className="shrink-0 w-8 h-8 rounded hover:bg-warning/10 flex items-center justify-center cursor-pointer"
                  >
                    <Star className={`h-3.5 w-3.5 ${isFav ? "fill-warning text-warning" : "text-muted-foreground"}`} />
                  </span>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-primary tabular-nums">
                      Nu. {(product.sale_price || product.mrp || 0).toFixed(0)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{product.unit || "pcs"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
