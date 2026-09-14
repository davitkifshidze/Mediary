import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/* ============================================================
   რიცხვის არჩევა მზა სიიდან + „სხვა" (Tasks §3.6).

   ⚠️ **„სხვა" სიის ბოლო ოფშენია და არა ცალკე ველი** — შენი პირობა.
   შეყვანის ველი მხოლოდ მაშინ ჩნდება, როცა „სხვა" აირჩია; დანარჩენ დროს
   ეკრანზე მხოლოდ ერთი კონტროლია.

   ⚠️ **`allowNone` = „არცერთი (0)"** ცხადი არჩევანია და არა „არ შეავსო":
   გალერეაზე ეს ნიშნავს „ამ სამიზნეზე ფოტო არ გინდა" (მაგ. ფილმზე 5,
   მსახიობზე 0) — სწორედ ის, რაც ერთმა საერთო რიცხვმა ვერ გამოხატა.

   ⚠️ **ეს შაბლონი ყველგან უნდა გავრცელდეს**, სადაც მსგავსი რიცხვის სიაა
   (§3.6-ის მოთხოვნა) — ამიტომ კომპონენტია და არა დიალოგის შიდა ფუნქცია.
   2026-09-13-ს სწორედ ამან შეცვალა ფოტოს ბადის ექვსი ჩიპი
   (`PhotoPageSizePick`) — ე.ი. „რამდენი გამოჩნდეს" და „რამდენი ჩამოიტვირთოს"
   ერთი და იმავე კონტროლია და არა ორი სხვადასხვანაირად მოწყობილი რიგი.
   ============================================================ */

/** სენტინელი — რიცხვს ვერ დაემთხვევა, ე.ი. „სხვა" ვერ აირევა 0-ში */
const OTHER = 'other'

export function NumberPick({
  value,
  onChange,
  options,
  allowNone,
  noneLabel,
  noneLast,
  min = 0,
  max = 9999,
  className,
  size = 'default',
  id,
}: {
  value: number
  onChange: (value: number) => void
  options: number[]
  /** „არცერთი (0)" ვარიანტი სიაში */
  allowNone?: boolean
  /**
   * რა ერქვას ნულს. ⚠️ ნული ყველგან ერთსა და იმავეს **არ** ნიშნავს:
   * ჩამოტვირთვაზე ეს „არცერთია", ფოტოს ბადეზე — „ყველა". ამიტომ წარწერა
   * გამომძახებლის სათქმელია და არა კომპონენტში ჩაჭედილი.
   */
  noneLabel?: string
  /** ნული სიის **ბოლოში** — „10 · 20 · … · ყველა · სხვა" ასე იკითხება */
  noneLast?: boolean
  min?: number
  max?: number
  className?: string
  /**
   * `sm` — ხელსაწყოთა ზოლისთვის (ფოტოს ბადე); `Button size="sm"`-ის
   * სიმაღლეა (h-9), თორემ ზოლში ღილაკებს ვერ გაუსწორდება.
   * ⚠️ ზომა **კომპონენტშია**
   * და არა გამომძახებლის კლასებში: სელექტიც და „სხვა"-ს ველიც ერთად უნდა
   * დაბლდეს, თორემ ორი კონტროლი სხვადასხვა სიმაღლისა დარჩება.
   */
  size?: 'sm' | 'default'
  id?: string
}) {
  const { t } = useTranslation()

  const rest = options.filter((n) => n !== 0)
  const list = allowNone ? (noneLast ? [...rest, 0] : [0, ...rest]) : rest
  const known = list.includes(value)
  const [custom, setCustom] = useState(!known)

  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const small = size === 'sm'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Select
        value={custom ? OTHER : String(value)}
        onValueChange={(v) => {
          if (v === OTHER) {
            setCustom(true)
            return
          }
          setCustom(false)
          onChange(Number(v))
        }}
      >
        <SelectTrigger id={id} className={cn(small && 'h-9 w-auto min-w-24')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {list.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n === 0 ? (noneLabel ?? t('numberPick.none')) : n}
            </SelectItem>
          ))}
          {/* ბოლოში — „სხვა", სადაც რიცხვს თვითონ წერ */}
          <SelectItem value={OTHER}>{t('numberPick.other')}</SelectItem>
        </SelectContent>
      </Select>

      {custom && (
        <Input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          className={cn('w-24', small && 'h-9 w-20')}
          value={value}
          aria-label={t('numberPick.other')}
          onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
        />
      )}
    </div>
  )
}
