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
