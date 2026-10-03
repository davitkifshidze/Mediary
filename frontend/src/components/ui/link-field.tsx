import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Link2, Loader2, X } from 'lucide-react'
import { fetchLinkPreview, isProbeableUrl, type LinkPreview } from '@/api/links'
import { formatDuration } from '@/lib/videoDuration'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/* ============================================================
   **ბმულის ველი შემოთავაზებით** (Tasks §15.2).

   შენი სიტყვები: „სადაც ვიდეო ან რამე ბმული ისმება, მეტა-ტეგებით შეეძლოს
   წამოიღოს ფოტო, სათაური და ასე შემდეგ და ჩასვას შესაბამის ადგილას, ან
   შემოგთავაზოს მაინც".

   `LinkField` ჩვეულებრივი `Input`-ია, რომელიც **paste-ზე და blur-ზე** ბმულს
   სერვერს აკითხებს (`POST /links/metadata`) და ქვეშ ბარათს ხატავს:
   „ნაპოვნია: სათაური · ესკიზი" ღილაკებით **„ჩასმა"** და **„უარყოფა"**.
   შედეგი **შემოთავაზებაა**: `onFound` მოსვლისთანავე მხოლოდ **ცარიელ**
   ველებს ავსებს (ბუკმარკის `QuickFill`-ის იგივე წესი), „ჩასმა" კი შევსებულსაც
   გადაწერს — ეს უკვე ადამიანის ცხადი არჩევანია.

   ⚠️ **იგივე ბმული მეორედ არ იკითხება** (ველიდან გასვლა-დაბრუნება),
   შეცვლილი — კი. ⚠️ ჩავარდნა ჩუმია: გვერდი შეიძლება დახურული იყოს,
   ფორმა ხელით ივსება. ⚠️ ბარათი არ ჩანს, სანამ სერვერმა არაფერი იპოვა
   (არც სათაური, არც სურათი) — ცარიელი „ნაპოვნია" ტყუილი იქნებოდა.
   ============================================================ */

function useLinkPreview(onFound?: (preview: LinkPreview) => void) {
  const [preview, setPreview] = useState<LinkPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const last = useRef<string | null>(null)
  const found = useRef(onFound)
  useEffect(() => {
    found.current = onFound
  }, [onFound])

  const probe = useCallback(async (raw: string) => {
    const url = raw.trim()
    if (!isProbeableUrl(url) || url === last.current) return
    last.current = url
    setLoading(true)
    try {
      const next = await fetchLinkPreview(url)
      // სანამ ველოდებოდით, ბმული შეიცვალა — ძველი პასუხი აღარ გვაინტერესებს
      if (last.current !== url) return
      setPreview(next)
      if (next.title || next.image_url) found.current?.(next)
    } catch {
      setPreview(null)
    } finally {
      if (last.current === url) setLoading(false)
    }
  }, [])

  const dismiss = useCallback(() => setPreview(null), [])

  return { preview, loading, probe, dismiss }
}

/** „ნაპოვნია: სათაური · ესკიზი" + ჩასმა/უარყოფა */
function LinkSuggestCard({
  preview,
  onApply,
  onDismiss,
  className,
}: {
  preview: LinkPreview
  /** არ არის — ბარათი მხოლოდ გაცნობაა (ფილმის ტრეილერი: ჩასასმელი ველი არ არსებობს) */
  onApply?: () => void
  onDismiss: () => void
  className?: string
}) {
  const { t } = useTranslation()

  if (!preview.title && !preview.image_url) return null

  const meta = [preview.author, preview.site_name ?? preview.domain, preview.duration != null ? formatDuration(preview.duration) : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={cn('mt-2 flex items-center gap-3 rounded-lg border border-dashed border-primary/40 bg-secondary/40 p-2 text-sm', className)}
      data-testid="link-suggest"
    >
      {preview.image_url ? (
        <img
          src={preview.image_url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cn('shrink-0 rounded-md bg-muted object-cover', preview.kind === 'video' ? 'h-12 w-20' : 'size-12')}
        />
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <Link2 className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{t('links.found')}</p>
        <p className="truncate font-medium" title={preview.title ?? undefined}>
          {preview.title ?? preview.url}
        </p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onApply && (
          <Button type="button" size="sm" variant="outline" onClick={onApply}>
            <Check className="size-3.5" />
            {t('links.apply')}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss} aria-label={t('links.dismiss')} title={t('links.dismiss')}>
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function LinkField({
  id,
  value,
  onChange,
  onFound,
  onApply,
  placeholder = 'https://…',
  invalid = false,
  className,
  inputClassName,
  'aria-label': ariaLabel,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  /** მოსვლისთანავე — მხოლოდ ცარიელი ველების შევსებისთვის */
  onFound?: (preview: LinkPreview) => void
  /** „ჩასმა" — შევსებულსაც გადაწერს; არ არის → ბარათი მხოლოდ გაცნობაა */
  onApply?: (preview: LinkPreview) => void
  placeholder?: string
  invalid?: boolean
  className?: string
  inputClassName?: string
  'aria-label'?: string
}) {
  const { preview, loading, probe, dismiss } = useLinkPreview(onFound)

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (isProbeableUrl(text)) void probe(text)
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div className="relative">
        <Input
          id={id}
          type="url"
          inputMode="url"
          aria-label={ariaLabel}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => void probe(e.target.value)}
          onPaste={onPaste}
          className={cn(loading && 'pr-9', invalid && 'border-destructive', inputClassName)}
        />
        {loading && (
          <Loader2
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            data-testid="link-loading"
          />
        )}
      </div>
      {preview && (
        <LinkSuggestCard
          preview={preview}
          onApply={onApply ? () => { onApply(preview); dismiss() } : undefined}
          onDismiss={dismiss}
        />
      )}
    </div>
  )
}
