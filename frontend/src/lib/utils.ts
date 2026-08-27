import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind კლასების გაერთიანება/კონფლიქტების მოგვარება */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
