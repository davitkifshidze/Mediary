import * as React from 'react'
import { cn } from '@/lib/utils'

/* ============================================================
   ტექსტური ველი.

   ## Tasks §5.3 — `autoGrow`
   ⚠️ **ველი შიგთავსს მიჰყვება და შიდა გადახვევას არ აჩენს**: `rows` ქვედა
   ზღვარია, `maxRows` (ნაგულისხმევად 10) — ზედა; მხოლოდ მასზე მეტზე ჩნდება
   ველის საკუთარი სქროლი. აქამდე აღწერის `rows=4` ველი გრძელ ტექსტზე შიგნით
   სქროლდებოდა — მოდალში მეორე, პატარა გადახვევის ზოლი.

   ⚠️ **JS-ით და არა `field-sizing: content`-ით**: ეს CSS-თვისება Firefox-ში ჯერ
   არ არის, ზედა ზღვარიც `max-height`-ით უნდა დაითვალოს — ე.ი. ორი გზა ორ
   ბრაუზერში სხვანაირად მოიქცეოდა. სიმაღლე `scrollHeight`-იდან ითვლება
   ყოველ შეყვანაზე და `value`-ს გარედან ცვლილებაზე (ფორმის ჩატვირთვა).

   ⚠️ **jsdom-ში `scrollHeight` 0-ია** — მაშინ ინლაინ სიმაღლე არ იწერება და
   ველი `rows`-ით რჩება, როგორც აქამდე (ტესტები ამით არ იცვლება).
   ============================================================ */

/** `rows`/`maxRows` → პიქსელები: ხაზის სიმაღლე × რიგები + პადინგი + ჩარჩო */
function rowsToPx(el: HTMLTextAreaElement, rows: number): number {
  const s = getComputedStyle(el)
  const line = parseFloat(s.lineHeight) || 20
  const extra =
    (parseFloat(s.paddingTop) || 0) +
    (parseFloat(s.paddingBottom) || 0) +
    (parseFloat(s.borderTopWidth) || 0) +
    (parseFloat(s.borderBottomWidth) || 0)

  return line * rows + extra
}

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    /** შიგთავსს მიჰყვება `rows`-დან `maxRows`-მდე (Tasks §5.3) */
    autoGrow?: boolean
    maxRows?: number
  }
>(({ className, autoGrow, maxRows = 10, rows, onInput, ...props }, ref) => {
  const inner = React.useRef<HTMLTextAreaElement | null>(null)

  const setRef = (el: HTMLTextAreaElement | null) => {
    inner.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  const fit = React.useCallback(() => {
    const el = inner.current
    if (!el || !autoGrow) return

    // ჯერ `auto`, რომ `scrollHeight` შემცირებასაც ხედავდეს და არა მხოლოდ ზრდას
    el.style.height = 'auto'
    if (!el.scrollHeight) {
      el.style.height = ''
      return
    }

    const s = getComputedStyle(el)
    const borders = (parseFloat(s.borderTopWidth) || 0) + (parseFloat(s.borderBottomWidth) || 0)
    const wanted = el.scrollHeight + borders
    const min = rowsToPx(el, rows ?? 2)
    const max = rowsToPx(el, Math.max(maxRows, rows ?? 2))

    el.style.height = `${Math.min(Math.max(wanted, min), max)}px`
    el.style.overflowY = wanted > max ? 'auto' : 'hidden'
  }, [autoGrow, maxRows, rows])

  React.useLayoutEffect(() => {
    fit()
  }, [fit, props.value])

  return (
    <textarea
      ref={setRef}
      rows={rows}
      onInput={(e) => {
        fit()
        onInput?.(e)
      }}
      className={cn(
        'flex min-h-20 w-full rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:opacity-50',
        autoGrow && 'resize-none',
        className,
      )}
      {...props}
    />
  )
})
Textarea.displayName = 'Textarea'
