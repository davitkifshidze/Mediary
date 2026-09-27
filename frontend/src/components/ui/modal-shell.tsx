import { useId, useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ArrowLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AutoHeight } from '@/components/ui/auto-height'
import { InfoHint } from '@/components/ui/info-hint'

/**
 * კომპაქტური მოდალი (ჟანრები, ვიდეოს ფორმა …).
 * z-60/61 — `useConfirm` (z-90) მასზე მაღლა დგება.
 *
 * ⚠️ **დახურვის ჯვარი 2026-09-14-მდე არ არსებობდა** (შენი მითითება): გამოსვლა
 * მხოლოდ `Esc`-ით ან ფონზე დაჭერით შეიძლებოდა — ორივე უხილავია და სენსორულ
 * ეკრანზე პრაქტიკულად არ არსებობს.
 *
 * ⚠️ **`onBack` ცალკე მოქმედებაა და არა დახურვის სინონიმი**: როცა მოდალი
 * მეორე მოდალიდან იხსნება (შეხსენებები ჩანაწერის ფორმიდან), „უკან" წინა
 * ეკრანს აბრუნებს — ისარი ცხადად ამბობს, რომ არსად არაფერი იკარგება.
 *
 * ⚠️ **სიგანე 2026-09-14-ს გაიზარდა** (`wide` 3xl → 5xl, ჩვეულებრივი lg → xl):
 * ველების ორსვეტიანი ფორმები და ფოტოების ბადეები ვიწრო „მილში" იკუმშებოდა.
 * იმავე დღეს დაემატა მესამე ზომა — **`full`** (`max-w-7xl`): ფაილის მნახველს
 * PDF-იც, ვიდეოც და სურათიც ერთ ეკრანზე უნდა დაეტიოს.
 */

/* ============================================================
   **მოდალების დასტა — ერთდროულად მხოლოდ ერთი ჩანს (2026-09-14).**

   შენი მითითება: „თუ ახალი მოდალი იხსნება, წინა იხურება და ახალი გამოდის;
   თუ იმას დახურავ ან უკან გახვალ, ეს ახალი იხურება და ძველი იხსნება."

   ⚠️ **წესი აქ წერია და არა გამომძახებლებში.** შეხსენებების დიალოგმა ის
   ხელით გაატარა (`NoteDetail`/`NoteForm` თავიანთ `ModalShell`-ს მალავდნენ),
   მაგრამ ეს იმას ნიშნავდა, რომ ყოველი ახალი ჩადგმული მოდალი იმავე კოდს
   ხელახლა დაწერდა — და ერთი დავიწყებული ადგილი ისევ „პატარა ფანჯარას
   დიდზე ზემოდან" მოგვცემდა.

   ⚠️ **ქვედა მოდალის *კომპონენტი* მონტირებული რჩება** — იმალება მხოლოდ მისი
   `ModalShell`. ე.ი. ნახევრად შევსებული ფორმის state ადგილზეა, როცა უკან
   დაბრუნდები (ზუსტად ის თვისება, რისთვისაც ეს წესი შეხსენებებზე შემოვიდა).

   ⚠️ **`useSyncExternalStore` და არა Context** — provider-ს `main.tsx`-ში
   ჩამატება სჭირდებოდა და ყოველი მოდალი მშობლის ხელით შემოვლას მოითხოვდა;
   მოდალი კი პორტალია და ხის ფორმა მისთვის მნიშვნელობას კარგავს. დასტა
   მოდულის დონეზეა, ე.ი. ერთი წყაროა მთელი აპლიკაციისთვის.
   ============================================================ */

let stack: string[] = []
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function snapshot() {
  return stack
}

/** ამ მოდალია თუ არა ზედა — მხოლოდ ზედა იხატება */
function useIsTopModal(id: string) {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot)

  /* ⚠️ **`useLayoutEffect` და არა `useEffect`.** ჩვეულებრივი effect
     დახატვის **შემდეგ** გადიოდა, ე.ი. ახალი მოდალის გახსნისას ორივე
     ერთი კადრით ერთად დაიხატებოდა — ზუსტი ის ციმციმი, რომელსაც ეს
     წესი აყრის. მონტაჟისას დასტის ბოლოშია, დემონტაჟზე — ამოდის,
     ე.ი. ქვედა ავტომატურად ბრუნდება. */
  useLayoutEffect(() => {
    stack = [...stack, id]
    emit()

    return () => {
      stack = stack.filter((x) => x !== id)
      emit()
    }
  }, [id])

  const index = current.indexOf(id)

  return {
    // ⚠️ ჯერ დაურეგისტრირებელი (პირველი render) მოდალიც ჩანს, თორემ ერთი
    // კადრით ციმციმდებოდა.
    top: index === -1 || index === current.length - 1,
    /** ქვემოთ სხვა მოდალია — ე.ი. „უკან" აზრიანია */
    nested: index > 0,
  }
}

export type ModalSize = 'default' | 'wide' | 'full'

const SIZES: Record<ModalSize, string> = {
  default: 'max-w-xl',
  wide: 'max-w-5xl',
  full: 'max-w-7xl',
}

export function ModalShell({
  title,
  onClose,
  onBack,
  destructive,
  wide,
  size,
  hint,
  aside,
  children,
}: {
  title: string
  onClose: () => void
  /**
   * „უკან" — მხოლოდ მაშინ, როცა მოდალი სხვა ეკრანიდან შემოვიდა.
   *
   * ⚠️ მითითების გარეშე **თვითონ ჩნდება**, თუ ქვემოთ სხვა მოდალი დგას:
   * ჩადგმულ მოდალზე „დახურვა" ისედაც წინას აბრუნებს, ისარი კი ამას ცხადად
   * ამბობს. ცალკე prop მაშინ სჭირდება, როცა „უკან" სხვა რამეა და არა დახურვა.
   */
  onBack?: () => void
  destructive?: boolean
  /** `size="wide"`-ის მოკლე ჩანაწერი — ოცამდე გამომძახებელი ასე წერია */
  wide?: boolean
  /** `default` (max-w-xl) · `wide` (5xl) · `full` (7xl) */
  size?: ModalSize
  /** Tasks §8.3 — მოდალის შესავალი ახსნა: i სათაურის გვერდით და არა აბზაცი */
  hint?: string
  /**
   * Tasks §19 — **სათაურის ზოლის მარჯვენა მხარე** (ვებძებნის ხარჯი, ვიდეოს
   * ტიპის ამრჩევი). ⚠️ ზოლი მიმაგრებულია, ე.ი. აქ ის დგას, რაც შედეგების
   * გადახვევისას ხილული უნდა დარჩეს. ადგილი თუ არ ჰყოფნის, **მეორე ხაზზე**
   * ჩამოდის და დახურვის ჯვარი ზედა კუთხეში რჩება — ორივე ერთ ხაზზე სათაურს
   * ბოლომდე შეკუმშავდა.
   */
  aside?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  const id = useId()
  const { top, nested } = useIsTopModal(id)

  const back = onBack ?? (nested ? onClose : undefined)

  /* ⚠️ **ქვედა მოდალი CSS-ით იმალება და არა Radix-ის დონეზე იხურება.**
     ორივე ალტერნატივა ნაცადია და ორივემ ვერ იმუშავა: `return null`-იც და
     `open={top}`-იც `@radix-ui/react-presence`-ს „დაუსრულებელ განახლებაში"
     აგდებდა (`Maximum update depth exceeded` — ორივე ამავე ფაილის ტესტმა
     დააფიქსირა), რადგან პორტალი იმავე კომიტში ინგრეოდა, რომელშიც მეორე
     იხსნებოდა.

     დამალვას ორი უპირატესობაც აქვს: Radix ჩადგმულ დიალოგებს იცნობს
     (ფოკუსს ზედას აძლევს), ხოლო `children` **სრულიად მონტირებული რჩება**,
     ე.ი. ნახევრად შევსებული ფორმა ზუსტად ისე დახვდება, როგორც დატოვე. */
  const hidden = !top

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn('fb-overlay fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm', hidden && 'hidden')}
        />
        {/* Tasks §7.1 — სათაურის ზოლი მიმაგრებულია, შუა ნაწილი გადაიხვევა,
            ქვედა ზოლი (`ModalFooter`) კი `sticky`-ით ბოლოში რჩება. ⚠️ სწორედ ეს
            უშვებს ფიქსირებულ სიმაღლეს: ადრე მთელი ფანჯარა ერთად იხვეოდა და
            ღილაკები გადახვევაში იმალებოდა. */}
        <DialogPrimitive.Content
          className={cn(
            'fb-content fixed left-1/2 top-1/2 z-[61] flex max-h-[90vh] w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl focus:outline-none',
            SIZES[size ?? (wide ? 'wide' : 'default')],
            hidden && 'hidden',
          )}
        >
          <div className="flex shrink-0 items-start gap-2 px-6 pb-2 pt-6">
            {back && (
              <button
                type="button"
                onClick={back}
                aria-label={t('actions.back')}
                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}

            {/* ⚠️ სათაური და `aside` **ერთ გადასატან ჯგუფშია**, ჯვარი კი მის გარეთ:
                ვიწრო ეკრანზე ან გრძელ სათაურზე `aside` მეორე ხაზზე ჩამოდის
                (მარჯვნივ მიკრული), დახურვა კი ყოველთვის ზედა კუთხეში რჩება. */}
            <div className="flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2">
              <div className="flex min-w-0 items-center gap-2">
                <DialogPrimitive.Title
                  className={cn(
                    'min-w-0 truncate font-display text-lg font-semibold tracking-tight',
                    destructive && 'text-destructive',
                  )}
                >
                  {title}
                </DialogPrimitive.Title>
                <InfoHint info={hint} />
              </div>

              {aside && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{aside}</div>}
            </div>

            {/* ⚠️ დახურვა **წითელ ჰოვერზეა** — იმავე ენაზე, რითაც ფილტრების
                „გასუფთავება" ლაპარაკობს: ეს ერთადერთი ღილაკია, რომელიც ეკრანს ხურავს. */}
            <DialogPrimitive.Close
              aria-label={t('actions.close')}
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          {/* ⚠️ **ფიქსირებული სიმაღლე უარყოფილია** (შენი შესწორება, 2026-09-27:
              „ყველგან შესაბამისი სიმაღლის უნდა იყოს") — ფანჯარა შიგთავსს მიჰყვება
              და ცვლილებისას რბილად იზრდება ან პატარავდება. */}
          <AutoHeight scroll innerClassName="px-6 pb-6">
            {children}
          </AutoHeight>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/* ============================================================
   მოდალის ქვედა ზოლი (Tasks §7.1) — `sticky` და არა გადახვევის გარეთ.

   ⚠️ **რატომ `sticky`.** 71 მოდალიდან უმეტესობას ღილაკები `<form>`-ის
   შიგნით აქვს (`type="submit"`); ზოლის ფორმიდან გამოტანა ყოველ მათგანში
   `form="<id>"`-ს მოითხოვდა. `sticky bottom-0` მიმაგრებულია იმავე
   ადგილიდან — ფორმა ბოლომდე გრძელდება, ამიტომ ზოლი ხილვის ბოლოში რჩება.

   ⚠️ `-mx-6 -mb-6` ზოლს სხეულის პადინგამდე ჭიმავს — ის **ბოლო** ელემენტი
   უნდა იყოს, თორემ ქვედა კიდეს ვერ მიეკვრება.
   ============================================================ */
export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 -mx-6 -mb-6 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background px-6 py-4',
        className,
      )}
    >
      {children}
    </div>
  )
}
