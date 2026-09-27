import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FieldLabel } from '@/components/ui/field-label'
import { InfoHint } from '@/components/ui/info-hint'
import { ModalFooter } from '@/components/ui/modal-shell'

/* ============================================================
   **ფორმის ერთი ჩონჩხი** (Tasks §26.1).

   შენი სიტყვები: „ყველა მოდულში გაითვალისწინე, რომ დამატება-რედაქტირებაში
   ველები სწორად, სიმეტრიულად და ლამაზად იყოს დალაგებული". აქამდე ცხრა
   ფორმას ცხრა განლაგება ჰქონდა: `sm:grid-cols-4`-ზე სამი ველი (მეოთხე
   სვეტი ცარიელი), `grid-cols-3`-ზე ორი, შენახვის ღილაკი ფორმის შუაში და
   დამატებითი ველები მის ქვემოთ.

   ⚠️ **12-სვეტიანი ბადე და ველის ზომა** (`full` · `half` · `third` ·
   `quarter`) — ფიქსირებული „ოთხი სვეტის" ნაცვლად. სვეტების რაოდენობა
   ველს ეკუთვნის და არა რიგს: რიგი ივსება ველების ზომით, ხოლო ველების
   კონსტრუქტორით დამალული ველი (`display: none`) ბადეში ადგილს არ იკავებს
   — შუა რიგში ხვრელი არ რჩება.

   ⚠️ **ერთი ვერტიკალური რიტმი**: სექციებს შორის `space-y-6`, ბადეში
   `gap-4`, ლეიბლს `mb-1.5` (`Label`-ისაა), შეცდომას `mt-1`. ველის
   შიგნით სხვა დაშორება **არ ემატება** — ორმაგი (`mb-1.5` + `mt-1.5`)
   სწორედ ის იყო, რაც ფორმებს არათანაბარს ხდიდა.

   ⚠️ **ღილაკების ზოლი ბოლოშია და მიმაგრებულია** (`FormFooter` =
   `ModalFooter`, §7.1): ის `<form>`-ის **გარეთ** დგას და ფორმას `form="…"`-ით
   უშვებს — ე.ი. ფორმის შემდეგ მდგარი ბლოკები (დამატებითი ველები,
   ატვირთვები) ღილაკების ზემოთ რჩება და „შენახვის შემდეგ მოსულს" აღარ ჰგავს.
   ============================================================ */

/** ტექსტური ველის სიმაღლე — ერთი ყველა ფორმაში (აქამდე 3-დან 8 რიგამდე მერყეობდა) */
export const FORM_TEXT_ROWS = 4

export type FieldSize = 'full' | 'half' | 'third' | 'quarter'

/* ⚠️ Tailwind კლასს ცვლადიდან ვერ დაბადებს — რუკა ლიტერალებია */
const SPAN: Record<FieldSize, string> = {
  full: 'col-span-12',
  half: 'col-span-12 sm:col-span-6',
  third: 'col-span-12 sm:col-span-4',
  quarter: 'col-span-12 sm:col-span-6 lg:col-span-3',
}

/** 12-სვეტიანი ბადე */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-12 gap-4', className)}>{children}</div>
}

/**
 * **ფორმის სექცია** — სათაური + ბადე.
 *
 * `media` — სექციის გვერდითი სვეტი (მთავარი ფოტო): §26-ის მოთხოვნით
 * **ფოტო ზემოთაა**, ძირითად ველებთან ერთად, და არა ფორმის ბოლოში.
 * ვიწრო ეკრანზე ის ველებს ზემოდან ადგება.
 */
export function FormSection({
  title,
  hint,
  aside,
  media,
  plain,
  children,
  className,
}: {
  title?: string
  hint?: string
  /** სათაურის რიგის მარჯვენა მხარე (მაგ. დამატებითი ველების „შენახვა") */
  aside?: ReactNode
  media?: ReactNode
  /** შიგთავსი თავისი განლაგებით (ატვირთვების ბლოკი) — ბადის გარეშე */
  plain?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      {title && (
        <div className="mb-4 flex min-h-8 items-center gap-2 border-b border-border/70 pb-2">
          <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
            <span className="truncate">{title}</span>
            <InfoHint info={hint} />
          </h3>
          {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
        </div>
      )}

      {plain ? (
        children
      ) : media ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="shrink-0">{media}</div>
          <FormGrid className="min-w-0 flex-1">{children}</FormGrid>
        </div>
      ) : (
        <FormGrid>{children}</FormGrid>
      )}
    </section>
  )
}

/**
 * **ერთი ველი ბადეში** — ლეიბლი, კონტროლი, შეცდომა.
 *
 * ⚠️ `show={false}` ველს **`hidden`-ით** მალავს და არ ხსნის: ფორმის state
 * და შეცდომის ტექსტი ადგილზე რჩება (`hiddenPicks()` სწორედ ასეთ ველს
 * ასახელებს თოსტით, §4.1).
 *
 * ⚠️ `action` ლეიბლის რიგში დგება (მაგ. „+ ჟანრი") და **პატარა** უნდა იყოს:
 * რიგი ფიქსირებული სიმაღლისაა, თორემ მეზობელი ველის კონტროლი დაბლა
 * ჩამოიწევდა და ბადის რიგი აირეოდა.
 */
export function FormField({
  size = 'full',
  show = true,
  label,
  htmlFor,
  required,
  hint,
  action,
  error,
  className,
  children,
}: {
  size?: FieldSize
  show?: boolean
  label?: ReactNode
  htmlFor?: string
  required?: boolean
  hint?: string
  action?: ReactNode
  error?: string | null
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('min-w-0', SPAN[size], !show && 'hidden', className)}>
      {label != null &&
        (action ? (
          <div className="mb-1.5 flex min-h-5 items-center justify-between gap-2">
            <FieldLabel htmlFor={htmlFor} required={required} hint={hint} className="mb-0">
              {label}
            </FieldLabel>
            {action}
          </div>
        ) : (
          <FieldLabel htmlFor={htmlFor} required={required} hint={hint}>
            {label}
          </FieldLabel>
        ))}
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}

/**
 * ლეიბლის რიგის პატარა მოქმედება („+ ჟანრი", „+ ბმული") — ერთი სიმაღლე
 * ყველა ფორმაში, რომ რიგი არ გაიზარდოს.
 */
export function FieldAction({
  onClick,
  icon,
  children,
  disabled,
}: {
  onClick: () => void
  icon?: ReactNode
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-5 cursor-pointer items-center gap-1 rounded-md text-xs font-medium text-primary transition-colors hover:text-primary/70 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  )
}

/**
 * **მიმაგრებული ქვედა ზოლი** — „გაუქმება" და „შენახვა".
 *
 * ⚠️ `formId` სავალდებულოა: ზოლი `<form>`-ის გარეთ დგას (ბოლო ელემენტია),
 * ღილაკი კი ფორმას HTML5-ის `form="…"`-ით უშვებს.
 *
 * ⚠️ შენახვისას **„ინახება…"** წერია ყველგან — კურსსა და ადგილს აქამდე
 * „შენახვა" ეწერა, ე.ი. ჩანდა, თითქოს ღილაკი არაფერს აკეთებდა.
 */
export function FormFooter({
  formId,
  onCancel,
  saving,
  savingLabel,
  page,
  children,
}: {
  formId: string
  onCancel: () => void
  saving?: boolean
  /** შენახვის მიმდინარე ეტაპი (მაგ. „ფაილი 2 / 5") — ნაგულისხმევად „ინახება…" */
  savingLabel?: string
  /**
   * ფორმა გვერდზეა და არა მოდალში (ფილმი/სერიალი/ანიმე). ⚠️ ზოლი იქაც
   * მიმაგრებულია — ფანჯრის ქვედა კიდეზე, **დამკვრელის ზოლის ზემოთ**
   * (`--player-h`, `<main>`-ის იგივე ცვლადი), თორემ მის ქვეშ დაიმალებოდა.
   */
  page?: boolean
  /** დამატებითი მოქმედებები მარცხნივ (მაგ. „სინქრონიზაცია") */
  children?: ReactNode
}) {
  const { t } = useTranslation()

  const body = (
    <>
      {children && <div className="mr-auto flex flex-wrap items-center gap-2">{children}</div>}
      <Button type="button" variant="ghost" onClick={onCancel}>
        {t('actions.cancel')}
      </Button>
      <Button type="submit" form={formId} disabled={saving}>
        {saving && <Loader2 className="size-4 animate-spin" />}
        {saving ? (savingLabel ?? t('actions.saving')) : t('actions.save')}
      </Button>
    </>
  )

  if (page) {
    return (
      <div className="sticky bottom-[var(--player-h,0px)] z-10 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background py-4">
        {body}
      </div>
    )
  }

  return <ModalFooter>{body}</ModalFooter>
}
