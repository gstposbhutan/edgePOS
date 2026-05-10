"use client";

import type { Product, Category } from "@/hooks/use-products";

interface ProductImageProps {
  product: Product;
  category?: Category;
  className?: string;
}

export function ProductImage({ product, category, className }: ProductImageProps) {
  const catColor = category?.color || "#6b7280";

  if (product.image_url) {
    return (
      <img
        src={product.image_url}
        alt={product.name}
        className={`h-full w-full object-cover ${className || ""}`}
        loading="lazy"
      />
    );
  }

  const initials = product.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`h-full w-full flex items-center justify-center ${className || ""}`}
      style={{ background: `linear-gradient(135deg, ${catColor}22, ${catColor}44)` }}
    >
      <span className="text-2xl font-bold opacity-40" style={{ color: catColor }}>
        {initials}
      </span>
    </div>
  );
}
