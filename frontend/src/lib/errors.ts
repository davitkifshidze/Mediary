import axios from 'axios'

/** Laravel-ის ვალიდაციის შეცდომები → { field: firstMessage } */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!axios.isAxiosError(e)) return {}
  const errors = e.response?.data?.errors as Record<string, string[]> | undefined
  if (!errors) return {}
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v[0]]))
}

/** ერთი ადამიანური შეტყობინება (toast-ისთვის) */
export function errorMessage(e: unknown, fallback = 'შეცდომა'): string {
  if (!axios.isAxiosError(e)) return e instanceof Error ? e.message : fallback
  const data = e.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined
  const first = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
  return first ?? data?.message ?? e.message ?? fallback
}
