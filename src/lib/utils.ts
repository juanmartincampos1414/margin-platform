import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'ARS') {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatPercent(value: number, decimals = 1) {
  return `${value.toFixed(decimals)}%`
}

export function getMarginColor(margin: number) {
  if (margin >= 60) return 'text-emerald-600'
  if (margin >= 40) return 'text-yellow-600'
  return 'text-red-600'
}

export function getMarginBg(margin: number) {
  if (margin >= 60) return 'bg-emerald-50 border-emerald-200'
  if (margin >= 40) return 'bg-yellow-50 border-yellow-200'
  return 'bg-red-50 border-red-200'
}

// Shared by manual ingredient creation (POST /api/ingredients) and OCR
// ingredient matching (/api/invoices/process) — both must compute
// normalized_name identically, or a manually created ingredient won't be
// matched by a later invoice for the same product, creating a duplicate.
export function normalizeIngredientName(name: string) {
  return name.trim().toUpperCase().replace(/\s+/g, ' ')
}
