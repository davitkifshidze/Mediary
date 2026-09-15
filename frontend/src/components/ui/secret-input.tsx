import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Eye, EyeOff, Loader2, SquarePen, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/* ============================================================
   **შენახული საიდუმლო — გასაღები, ტოკენი** (შენი მითითება, 2026-09-15).

   ⚠️ **`type="password"` აქედან ამოღებულია და ეს შენი პირდაპირი მითითებაა.**
   მიზეზი ისაა, რომ ის ამ ამოცანას **საერთოდ ვერ წყვეტდა**: სერვერი შენახულ
   გასაღებს არ აბრუნებს, ე.ი. ველი ცარიელი იყო და ნიღაბი მხოლოდ
   `placeholder`-ში ეწერა — ნაცრისფრად, ფერმკრთალად, ზუსტად ისე, როგორც
   „აქ არაფერია". ე.ი. **შევსებული და ცარიელი ველი ერთნაირად გამოიყურებოდა**.

   ⚠️ **ამიტომ ფიფქები ხელითაა დახატული და ნამდვილი ტექსტია.** შენახული
   გასაღები ინფუთი კი აღარაა — ის „შევსებული" ველია: `••••••••••••a1b2`
   ჩვეულებრივი, მუქი ტექსტით. სამი ღილაკი გვერდითაა — თვალი (ნახვა),
   კოპირება და ფანქარი („შეცვლა"). სანამ ფანქარს არ დააჭერ, აკრეფა
   შეუძლებელია: ეს არა შეზღუდვა, არამედ ის, რაც „რაღაც უკვე დევს"-ს ამბობს.

   ⚠️ **აკრეფისას ტექსტი ღიად ჩანს და ესეც განზრახაა.** გასაღები ხელით არ
   იკრიფება — ის ბუფერიდან ისმება, და მისი დამალვა სწორედ იმ მომენტში
   ხელს უშლის, როცა უნდა გადაამოწმო, რაც ჩასვი. ხელით „ფიფქებად" ხატვა
   რედაქტირებადი ინფუთისთვის კურსორსა და მონიშვნას ტეხს.

   ⚠️ **ანგარიშის პაროლი ამ კომპონენტს არ იყენებს** — მისთვის ქვემოთ
   `PasswordInput`-ია. იქ შენახული მნიშვნელობა არ არსებობს (არაფერია
   საჩვენებელი), დამალვა კი აკრეფის *მომენტში* სჭირდება, და
   `type="password"` სწორედ ისაა, რასაც ბრაუზერის პაროლის მენეჯერი და
   ავტოშევსება ეყრდნობა.
   ============================================================ */

/** ერთი გზა ბუფერში ჩასაწერად — `navigator.clipboard` ყველგან არ არსებობს */
async function copyText(text: string): Promise<void> {
  try {
    // დაცული კონტექსტი (https / localhost)
    await navigator.clipboard.writeText(text)
  } catch {
    /* ⚠️ სათადარიგო გზა: იმავე dev-სერვერზე, ქსელის IP-ით გახსნილს,
       `navigator.clipboard` **საერთოდ არ აქვს** — პირდაპირი გამოძახება
       გაუგებარ „არაფერი მოხდა"-ს იძლეოდა. */
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

export function SecretInput({
  value,
  onChange,
  /** სერვერის ნიღაბი — `••••••••••••a1b2`. `null` = შენახული არაფერია */
  masked,
  placeholder,
  id,
  copyable = true,
  /** შენახული მნიშვნელობის წამოღება (`null` = ვერ ვაჩვენებ) */
  onReveal,
  className,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  masked?: string | null
  placeholder?: string
  id?: string
  copyable?: boolean
  onReveal?: () => Promise<string | null>
  className?: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /* ⚠️ „შენახული" მდგომარეობა მხოლოდ მაშინაა, როცა ნიღაბი მოვიდა **და**
     ჯერ არაფერი აგვიკრეფია: ერთი აკრეფილი სიმბოლოც ნიშნავს, რომ ახალ
     მნიშვნელობას წერ, და ძველის ჩვენება იმ წამს შეცდომაში შეგიყვანდა. */
  const stored = !!masked && value === '' && !editing

  async function reveal() {
    if (revealed !== null) {
      setRevealed(null)

      return
    }

    if (!onReveal) return

    setLoading(true)
    try {
      setRevealed(await onReveal())
    } finally {
      setLoading(false)
    }
  }

  async function copy() {
    let text = revealed ?? ''

    if (text === '' && onReveal) {
      setLoading(true)
      try {
        text = (await onReveal()) ?? ''
        setRevealed(text)
      } finally {
        setLoading(false)
      }
    }

    if (text === '') return

    await copyText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  /* ---------- შენახული: ინფუთი აღარაა, „შევსებული" ველია ---------- */
  if (stored) {
    return (
      <div
        className={cn(
          'flex h-10 items-center gap-1 rounded-md border border-border bg-muted/40 px-3',
          className,
        )}
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-mono text-sm',
            // ⚠️ **მუქი და არა ნაცრისფერი**: ფერმკრთალი ტექსტი ზუსტად
            // „ცარიელი ველივით" იკითხებოდა — სწორედ ეს იყო პრობლემა
            revealed === null ? 'tracking-[0.2em] text-foreground' : 'text-foreground',
          )}
        >
          {revealed ?? masked}
        </span>

        {onReveal && (
          <button
            type="button"
            onClick={reveal}
            disabled={disabled || loading}
            title={revealed === null ? t('secret.show') : t('secret.hide')}
            aria-label={revealed === null ? t('secret.show') : t('secret.hide')}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : revealed === null ? (
              <Eye className="size-4" />
            ) : (
              <EyeOff className="size-4" />
            )}
          </button>
        )}

        {copyable && onReveal && (
          <button
            type="button"
            onClick={copy}
            disabled={disabled || loading}
            title={t('secret.copy')}
            aria-label={t('secret.copy')}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setEditing(true)
            setRevealed(null)
            // ფოკუსი შემდეგ კადრში — ინფუთი ჯერ არ დახატულა
            window.requestAnimationFrame(() => inputRef.current?.focus())
          }}
          disabled={disabled}
          title={t('secret.change')}
          aria-label={t('secret.change')}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <SquarePen className="size-4" />
        </button>
      </div>
    )
  }

  /* ---------- ცარიელი ან რედაქტირებადი ---------- */
  return (
    <div className={cn('relative', className)}>
      <Input
        ref={inputRef}
        id={id}
        /* ⚠️ `text` და არა `password`: ეს ველი გასაღებისთვისაა, რომელიც
           ბუფერიდან ისმება — და ჩასმულის გადამოწმება სწორედ იმ წამს
           სჭირდება. ავტოშევსებას ვთიშავთ, თორემ ბრაუზერი პაროლის
           მენეჯერს შემოაგდებდა. */
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn('font-mono', masked && 'pr-10')}
      />

      {/* ⚠️ „გაუქმება" მხოლოდ მაშინ, როცა ძველი მნიშვნელობა არსებობს:
          თორემ ღილაკი „უკან რაში დავბრუნდე"-ზე პასუხს ვერ გასცემდა. */}
      {masked && (
        <button
          type="button"
          onClick={() => {
            setEditing(false)
            onChange('')
          }}
          title={t('actions.cancel')}
          aria-label={t('actions.cancel')}
          className="absolute inset-y-0 right-1 my-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

/* ============================================================
   **ანგარიშის პაროლი** — შესვლა, რეგისტრაცია, პაროლის შეცვლა.

   ⚠️ **აქ `type="password"` რჩება და ეს სხვა ამოცანაა.** შენახული
   მნიშვნელობა არ არსებობს (საჩვენებელი არაფერია), დამალვა კი აკრეფის
   *მომენტში* სჭირდება — და სწორედ `type="password"`-ს ეყრდნობა ბრაუზერის
   პაროლის მენეჯერი, ავტოშევსება და „გამოჩნდეს პაროლი" ღილაკი. ხელით
   დახატული ფიფქები რედაქტირებად ველში კურსორსა და მონიშვნას ტეხს, და
   სამაგიეროდ არაფერს გვაძლევს: „შევსებულია თუ არა" აქ ისედაც ჩანს, რადგან
   შენ ახლავე კრეფ.

   ⚠️ **კოპირება აქ არ არის** — პაროლს შენ თვითონ აკრიფებ, ბუფერში მისი
   დატოვება კი უბრალოდ საზიანოა.
   ============================================================ */
export function PasswordInput({
  value,
  onChange,
  id,
  autoComplete = 'off',
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  id?: string
  autoComplete?: string
  placeholder?: string
  className?: string
}) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)

  return (
    <div className={cn('relative', className)}>
      <Input
        id={id}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        title={shown ? t('secret.hide') : t('secret.show')}
        aria-label={shown ? t('secret.hide') : t('secret.show')}
        className="absolute inset-y-0 right-1 my-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}
