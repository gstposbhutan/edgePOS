"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { Product, Category } from "@/hooks/use-products";

const UNITS = ["pcs", "kg", "g", "litre", "ml", "btl", "box", "pack", "dozen", "pair", "set", "roll", "sheet", "bag", "can", "tube", "sachet"];

export interface ProductFormData {
  name: string;
  sku: string;
  barcode: string;
  hsn_code: string;
  unit: string;
  mrp: number;
  cost_price: number;
  sale_price: number;
  wholesale_price: number;
  current_stock: number;
  reorder_point: number;
  category: string;
}

const EMPTY_FORM: ProductFormData = {
  name: "",
  sku: "",
  barcode: "",
  hsn_code: "",
  unit: "pcs",
  mrp: 0,
  cost_price: 0,
  sale_price: 0,
  wholesale_price: 0,
  current_stock: 0,
  reorder_point: 10,
  category: "",
};

interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  product?: Product | null;
  categories: Category[];
  onSave: (data: ProductFormData) => Promise<{ success: boolean; error?: string }>;
}

export function ProductFormModal({ open, onClose, product, categories, onSave }: ProductFormModalProps) {
  const [form, setForm] = useState<ProductFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (product) {
        setForm({
          name: product.name || "",
          sku: product.sku || "",
          barcode: product.barcode || "",
          hsn_code: product.hsn_code || "",
          unit: product.unit || "pcs",
          mrp: product.mrp || 0,
          cost_price: product.cost_price || 0,
          sale_price: product.sale_price || product.mrp || 0,
          wholesale_price: product.wholesale_price || 0,
          current_stock: product.current_stock || 0,
          reorder_point: product.reorder_point || 10,
          category: product.category || "",
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setErrors({});
      setSaving(false);
    }
  }, [open, product]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    let salePrice = form.sale_price;
    if (!form.name.trim()) e.name = "Product name is required";
    if (!form.hsn_code.trim()) e.hsn_code = "HSN code is required";
    if (salePrice > 0 && form.mrp > 0 && salePrice > form.mrp) {
      e.sale_price = "Selling price cannot exceed MRP";
    }
    if (form.mrp > 0 && salePrice <= 0) {
      salePrice = form.mrp;
    }
    setErrors(e);
    if (salePrice !== form.sale_price) {
      setForm((prev) => ({ ...prev, sale_price: salePrice }));
    }
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const result = await onSave(form);
    setSaving(false);
    if (result.success) {
      toast.success(product ? "Product updated" : "Product created");
      onClose();
    } else {
      toast.error(result.error || "Failed to save product");
    }
  };

  const updateField = (field: keyof ProductFormData, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const gstAmount = (form.sale_price || form.mrp || 0) * 0.05;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Edit Product" : "Add Product"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Product Name *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Enter product name"
              className={errors.name ? "border-destructive" : ""}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* SKU + Barcode */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                value={form.sku}
                onChange={(e) => updateField("sku", e.target.value)}
                placeholder="e.g. PROD-001"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="barcode">Barcode</Label>
              <Input
                id="barcode"
                value={form.barcode}
                onChange={(e) => updateField("barcode", e.target.value)}
                placeholder="e.g. 8901234567890"
              />
            </div>
          </div>

          {/* HSN + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="hsn">HSN Code *</Label>
              <Input
                id="hsn"
                value={form.hsn_code}
                onChange={(e) => updateField("hsn_code", e.target.value)}
                placeholder="e.g. 2202"
                className={errors.hsn_code ? "border-destructive" : ""}
              />
              {errors.hsn_code && <p className="text-xs text-destructive">{errors.hsn_code}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">Unit</Label>
              <select
                id="unit"
                value={form.unit}
                onChange={(e) => updateField("unit", e.target.value)}
                className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label>Category</Label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => updateField("category", form.category === cat.id ? "" : cat.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    form.category === cat.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:border-primary/50"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: cat.color || "#888" }}
                  />
                  {cat.name}
                  {form.category === cat.id && <X className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>

          {/* Pricing */}
          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pricing</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cost">Cost Price</Label>
                <Input
                  id="cost"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.cost_price || ""}
                  onChange={(e) => updateField("cost_price", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mrp">MRP</Label>
                <Input
                  id="mrp"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.mrp || ""}
                  onChange={(e) => updateField("mrp", parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sale_price">Selling Price</Label>
                <Input
                  id="sale_price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.sale_price || ""}
                  onChange={(e) => updateField("sale_price", parseFloat(e.target.value) || 0)}
                  className={errors.sale_price ? "border-destructive" : ""}
                />
                {errors.sale_price && <p className="text-xs text-destructive">{errors.sale_price}</p>}
              </div>
            </div>
            {/* GST Preview */}
            {form.sale_price > 0 && (
              <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md p-2">
                <Badge variant="secondary" className="text-xs">GST 5%</Badge>
                <span className="text-muted-foreground">
                  MRP Nu. {(form.mrp || 0).toFixed(2)} — GST Nu. {gstAmount.toFixed(2)} — Customer pays Nu. {form.sale_price.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Stock */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="stock">Current Stock</Label>
              <Input
                id="stock"
                type="number"
                min={0}
                value={form.current_stock || ""}
                onChange={(e) => updateField("current_stock", parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reorder">Reorder Point</Label>
              <Input
                id="reorder"
                type="number"
                min={0}
                value={form.reorder_point || ""}
                onChange={(e) => updateField("reorder_point", parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Wholesale price */}
          <div className="space-y-1.5">
            <Label htmlFor="wholesale">Wholesale Price</Label>
            <Input
              id="wholesale"
              type="number"
              min={0}
              step={0.01}
              value={form.wholesale_price || ""}
              onChange={(e) => updateField("wholesale_price", parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1 h-11" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1 h-11 text-base" onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : product ? "Update Product" : "Add Product"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
