import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Button } from './button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { cn } from '@/lib/utils'

/* ============================================================
   **კლასიფიკატორის იქვე დამატება** — „+" ფორმის ველთან.

   კატეგორია, სტატუსი, ჟანრი, ტიპი, ალბომი: ფორმის შევსებისას აღმოაჩენ, რომ
   საჭირო მნიშვნელობა სიაში არ არის. ადრე ზოგ ველს „+" ჰქონდა, ზოგს — არა, და
   მაშინ ფორმა უნდა დაგეხურა, „კლასიფიკატორების" გვერდზე გადასულიყავი და
   თავიდან დაგეწყო.

   ⚠️ **ერთი სახე ყველგან**: ველის გვერდით „+" (`AddButton`) და სიის ბოლოს
   „+ ახლის დამატება" (`SelectWithAdd`-ის ბოლო პუნქტი, `AddChip` ჩიპების
   რიგში). სამივე **ერთსა და იმავე ფანჯარას** ხსნის — იმას, რასაც
   კლასიფიკატორების გვერდი (`useDictionaryAdd`, `lib/dictionaries.tsx`).

   ⚠️ **შენახვისთანავე ახალი მნიშვნელობა არჩეულია** — ფანჯარა `pick`-ს
   იძახებს; ფორმას მისი ხელით მოძებნა აღარ სჭირდება.
   ============================================================ */

/** `close` ფანჯარას ხურავს, `pick` ახლად შენახულ მნიშვნელობას ირჩევს */
export type AddDialog = (close: () => void, pick: (value: string) => void) => ReactNode

/** სიის ბოლო პუნქტის მნიშვნელობა — ნამდვილ მნიშვნელობას არასდროს ემთხვევა */
const ADD = '__inline-add__'

/** „+" ველის გვერდით — ერთი ზომა და იერი ყველა ფორმაში */
export function AddButton({
  label,
  onClick,
  disabled,
  className,
}: {
  /** რა ემატება — „კატეგორიის დამატება" (მინიშნება და `aria-label`) */
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn('shrink-0', className)}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      data-inline-add="button"
    >
      <Plus className="size-4" />
    </Button>
  )
}

/**
 * ფანჯრის მდგომარეობა იმ ველისთვის, რომელიც `Select` არ არის (ჩიპები,
 * მრავალარჩევანი): `open()` ღილაკზე მიდის, `node` — ფორმის ბოლოს.
 */
export function useInlineAdd(dialog: AddDialog | undefined, pick: (value: string) => void) {
  const [adding, setAdding] = useState(false)
  return {
    available: !!dialog,
    open: () => setAdding(true),
    node: adding && dialog ? dialog(() => setAdding(false), pick) : null,
  }
}

/**
 * ჩიპების რიგის ან სიის ბოლო — „+ ახლის დამატება" წყვეტილი ჩარჩოთი.
 * `label` — როცა რიგში ცხადი არ არის, *რა* ემატება („ახალი ალბომი").
 */
export function AddChip({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label?: string }) {
  const { t } = useTranslation()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="border-dashed text-muted-foreground"
      onClick={onClick}
      disabled={disabled}
      data-inline-add="chip"
    >
      <Plus className="size-3.5" />
      {label ?? t('actions.addNew')}
    </Button>
  )
}

/**
 * ჩამოსაშლელი სია „+"-ით: ბოლო პუნქტი „+ ახლის დამატება" და გვერდით „+".
 *
 * ⚠️ `dialog`-ის გარეშე (ლექსიკონი ამ ანგარიშზე არ არის, უფლება არ აქვს)
 * ჩვეულებრივი სიაა — ღილაკი და ბოლო პუნქტი არ იხატება.
 * ⚠️ ბოლო პუნქტის არჩევა მნიშვნელობას **არ ცვლის**: `Select` კონტროლირებადია
 * და ძველ არჩევანზე რჩება, სანამ ფანჯარა ახალს არ შეინახავს.
 */
export function SelectWithAdd({
  id,
  value,
  onValueChange,
  placeholder,
  invalid,
  disabled,
  addLabel,
  dialog,
  children,
}: {
  id?: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  /** შეცდომის ჩარჩო */
  invalid?: boolean
  disabled?: boolean
  addLabel: string
  dialog: AddDialog | undefined
  /** `SelectItem`-ები */
  children: ReactNode
}) {
  const { t } = useTranslation()
  const add = useInlineAdd(dialog, onValueChange)

  return (
    <div className="flex gap-1" data-inline-add="select">
      <Select
        value={value}
        onValueChange={(next) => (next === ADD ? add.open() : onValueChange(next))}
        disabled={disabled}
      >
        <SelectTrigger id={id} className={invalid ? 'border-destructive' : undefined}>
          <SelectValue placeholder={placeholder ?? t('validation.choose')} />
        </SelectTrigger>
        <SelectContent>
          {children}
          {add.available && (
            <SelectItem value={ADD} className="mt-1 border-t border-border pt-2 font-medium" data-inline-add="item">
              <span className="flex items-center gap-1.5">
                <Plus className="size-3.5" />
                {t('actions.addNew')}
              </span>
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {add.available && <AddButton label={addLabel} onClick={add.open} disabled={disabled} />}
      {add.node}
    </div>
  )
}
