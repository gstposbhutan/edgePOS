import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merges Tailwind CSS class names, resolving conflicts.
 * @param {...any} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Format amount as Bhutanese Ngultrum.
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-BT', {
    style: 'currency',
    currency: 'BTN',
    minimumFractionDigits: 2,
  }).format(amount).replace('BTN', 'Nu.')
}
