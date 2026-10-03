import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Minus, Plus } from 'lucide-react'
import { setBookProgress, type Book } from '@/api/books'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **კითხვის პროგრესი — თანამედროვედ** (Tasks §23.3).

   შენი სიტყვები: „ციტატისა და გვერდის ფუნქციონალიც უფრო გამითანამედროვე".

   ⚠️ **გვერდი უპირატესია, პროცენტი ავტომატურია**: როცა `pages` ცნობილია, ზოლი,
   სლაიდერი და −/+ ყველა გვერდზე მუშაობს და პროცენტი იქიდან ითვლება — ორი
   რიცხვი ვერასდროს დაშორდება (სერვერიც ასე ითვლის, `Book::syncProgress()`).
   `pages`-ის გარეშე მხოლოდ პროცენტია.

   ⚠️ **„დავასრულე" = 100 %** — სერვერი სტატუსსაც თვითონ ცვლის („წაკითხული",
   `BookController::setProgress`), და ეს ტოსტში **ჩანს**: ჩუმი სტატუსის ცვლილება
   „რატომ გახდა წაკითხული" კითხვას ტოვებდა.

   ⚠️ ერთი და იგივე ზოლი ორგან: დეტალის ბარათი (`ProgressCard`) და კონტექსტური
   მენიუს „გვერდის განახლება" (`ProgressDialog`, §23.4).
   ============================================================ */

/** −/+ და ხელით ჩაწერა ერთ კონტროლში — `NumberPick` მზა სიებისთვისაა, გვერდი კი თავისუფალი რიცხვია */
function PageStepper({
  value,
  max,
  onChange,
  disabled,
}: {
  value: number
  max: number
  onChange: (next: number) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const clamp = (n: number) => Math.min(max, Math.max(0, Math.round(n)))

  return (
    <div className="flex items-center gap-1" data-testid="page-stepper">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9"
        disabled={disabled || value <= 0}
        onClick={() => onChange(clamp(value - 1))}
        aria-label={t('books.pageMinus')}
      >
        <Minus className="size-4" />
      </Button>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        className="h-9 w-24 text-center tabular-nums"
        value={value}
        aria-label={t('books.notePage')}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
        disabled={disabled}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        aria-label={t('books.pagePlus')}
      >
        <Plus className="size-4" />
      </Button>
      <span className="ml-1 text-sm text-muted-foreground tabular-nums">/ {max}</span>
    </div>
  )
}

function useProgressSave(book: Book, onSaved?: (saved: Book) => void) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (input: { page?: number | null; percent?: number | null }) => setBookProgress(book.id, input),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['books'] })
      toast({
        title: t('books.progressSaved'),
        // სერვერმა სტატუსი შეცვალა — ეს ხმამაღლა უნდა ითქვას
        description:
          saved.status !== book.status
            ? t('books.statusChanged', { status: t(`books.statuses.${saved.status}`) })
            : undefined,
        variant: 'success',
      })
      onSaved?.(saved)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })
}

/** ზოლი + სლაიდერი + −/+ — საერთო სხეული ბარათისა და დიალოგისთვის */
function ProgressControls({
  book,
  onSave,
  busy,
  compact,
}: {
  book: Book
  onSave: (input: { page?: number | null; percent?: number | null }) => void
  busy: boolean
  compact?: boolean
}) {
  const { t } = useTranslation()
  const total = book.pages ?? 0
  const [page, setPage] = useState(book.progress_page ?? 0)
  const [percent, setPercent] = useState(book.progress_percent ?? 0)

  // ჩანაწერი განახლდა (შენახვის შემდეგ) — კონტროლები მას მიჰყვება
  useEffect(() => {
    setPage(book.progress_page ?? 0)
    setPercent(book.progress_percent ?? 0)
  }, [book.progress_page, book.progress_percent])

  const live = total ? Math.min(100, Math.round((page / total) * 100)) : percent
  const dirty = total ? page !== (book.progress_page ?? 0) : percent !== (book.progress_percent ?? 0)
  const finished = (book.progress_percent ?? 0) >= 100

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {total ? t('books.pageOf', { page, total }) : t('books.progressPercent')}
        </span>
        <span className="font-medium tabular-nums" data-testid="progress-percent">
          {live}%
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-md bg-muted" role="progressbar" aria-valuenow={live} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-md bg-primary transition-[width]" style={{ width: `${live}%` }} />
      </div>

      <div className={cn('flex flex-wrap items-center gap-3', compact && 'gap-2')}>
        {total > 0 && <PageStepper value={page} max={total} onChange={setPage} disabled={busy} />}
        <input
          type="range"
          min={0}
          max={total || 100}
          step={1}
          value={total ? page : percent}
          onChange={(e) => (total ? setPage(Number(e.target.value)) : setPercent(Number(e.target.value)))}
          disabled={busy}
          aria-label={total ? t('books.progressPage', { total }) : t('books.progressPercent')}
          className="h-2 min-w-40 flex-1 cursor-pointer accent-[var(--primary)]"
          data-testid="progress-slider"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !dirty}
          onClick={() => onSave(total ? { page } : { percent })}
        >
          {t('actions.save')}
        </Button>
        {!finished && (
          <Button size="sm" disabled={busy} onClick={() => onSave({ percent: 100 })}>
            <CheckCircle2 className="size-4" />
            {t('books.markFinished')}
          </Button>
        )}
      </div>
    </div>
  )
}

/** დეტალის ბარათი */
export function ProgressCard({ book }: { book: Book }) {
  const { t } = useTranslation()
  const save = useProgressSave(book)

  return (
    <section className="rounded-lg border border-border p-3" data-testid="progress-card">
      <h3 className="mb-3 text-sm font-semibold">{t('books.progressTitle')}</h3>
      <ProgressControls book={book} onSave={(input) => save.mutate(input)} busy={save.isPending} />
    </section>
  )
}

/** Tasks §23.4 — „გვერდის განახლება" კონტექსტური მენიუდან: პატარა ფანჯარა იმავე კონტროლებით */
export function ProgressDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const { t } = useTranslation()
  const save = useProgressSave(book, () => onClose())

  return (
    <ModalShell title={t('books.progressDialogTitle', { title: book.title_ka || book.title_en || '' })} onClose={onClose} hint={t('books.progressHint')}>
      <div className="mt-4">
        <ProgressControls book={book} onSave={(input) => save.mutate(input)} busy={save.isPending} compact />
      </div>
      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          {t('actions.close')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
