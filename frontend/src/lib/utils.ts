import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Tailwind კლასების გაერთიანება/კონფლიქტების მოგვარება */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* ============================================================
   `<input type="datetime-local">` ↔ ISO (Tasks §13 — ვადა და შეხსენება).

   ⚠️ `datetime-local` **ლოკალურ** დროს კითხულობს და წერს, backend კი UTC-ზეა.
   ორივე გარდაქმნა აქ ერთხელაა ჩაწერილი, რომ ფორმასა და შეხსენების რედაქტორს
   ერთი და იგივე წესი ჰქონდეთ — ორი ვარიანტი საათს ჩუმად წაანაცვლებდა.
   ============================================================ */

export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** ბაიტები წასაკითხ ფორმაში — ადმინის „დაკავებული ადგილი" (K14/L4) */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
