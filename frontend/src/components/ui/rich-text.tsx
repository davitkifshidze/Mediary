import { lazy, Suspense } from 'react'
import { FORM_TEXT_ROWS } from '@/components/ui/form-layout'
import { richTextMinHeight } from '@/lib/richText'

/* ============================================================
   **ფორმატიანი ტექსტის ველი** (Tasks §47.2) — აღწერა, ჩანაწერის ტექსტი,
   ჩანიშვნა. ღირებულება Markdown-ის სტრიქონია (`lib/richText.ts`).

   ⚠️ **რედაქტორი ზარმაცად იტვირთება** (TipTap + ProseMirror — ასეულობით KB):
   ის მხოლოდ ფორმას სჭირდება, სიებსა და დეტალებს — არა. ჩატვირთვამდე იგივე
   ჩარჩო და სიმაღლე ჩანს, შიგ არსებული ტექსტით — ფორმა არ ხტება.

   ⚠️ სიმაღლე `rows` სტრიქონიდან (ნაგულისხმევად 4) ~60vh-მდე იზრდება, მერე
   შიგნით იხვევა; „გაშლა" მთელ ფანჯარაზე წერაა (`ModalShell`-ის დასტაში —
   ფორმა ქვემოთ ხელუხლებლად რჩება).
   ============================================================ */

const Editor = lazy(() => import('@/components/ui/rich-text-editor'))

export interface RichTextProps {
  /** ⚠️ რედაქტირებად ელემენტს ადევს — `FormField`-ის `htmlFor` და ტესტები მას პოულობენ */
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** ზღვარი (`RICH_TEXT_MAX`/`NOTE_TEXT_MAX`) — მის 80%-იდან მთვლელი ჩნდება */
  maxLength?: number
  /** მინიმალური სიმაღლე სტრიქონებში */
  rows?: number
  /** ველის სახელი — „გაშლის" ფანჯრის სათაური და წამკითხველის წარწერა */
  label?: string
  autoFocus?: boolean
}

export function RichText(props: RichTextProps) {
  return (
    <Suspense fallback={<RichTextLoading {...props} />}>
      <Editor {...props} />
    </Suspense>
  )
}

function RichTextLoading({ id, value, rows }: RichTextProps) {
  return (
    <div className="fb-rich-text rounded-md border border-border bg-card shadow-sm" style={richTextMinHeight(rows ?? FORM_TEXT_ROWS)}>
      <div className="h-9 border-b border-border" />
      <div id={id} className="fb-rich-text-body whitespace-pre-line text-sm text-muted-foreground">
        {value}
      </div>
    </div>
  )
}
