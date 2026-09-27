import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { PhotoShowcase, type ShowcaseItem } from '@/components/ui/photo-showcase'
import { useConfirm } from '@/components/ui/feedback'

/* ============================================================
   **დეტალის ფანჯრის ერთი რიგი** (Tasks §26.4).

   შენი სიტყვები: „ფოტოები ბოლოშია — ზემოთ გააკეთე… ყველა მოდულში
   გაითვალისწინე". თამაშის ფანჯარამ ეს §22.2-ში დაადგინა და ახლა ერთია
   ყველასთვის: **თავში მთავარი ფოტო, სტატუსი და მოკლე ცნობები**; მერე
   ფოტოები; მერე აღწერა, ბმულები, ვიდეოები, დოკუმენტები და ჩანიშვნები.

   ⚠️ აქამდე ფანჯრებს სხვადასხვა თავი ჰქონდა: წიგნს ყდა და ცნობები
   საერთოდ არ ეხატებოდა, სამაგიდოს — ცნობები ჩარჩოში და ფოტოები ბმულების
   **ქვემოთ**, კურსსა და ადგილს — სტატუსი ზემოთ, ფოტოები ფაილების სიაში.
   ============================================================ */

export function DetailHero({
  image,
  alt,
  shape = 'poster',
  fallback,
  badges,
  children,
}: {
  image: string | null
  alt: string
  /** `poster` — წიგნი, თამაში, ფილმი; `wide` — ფოტოიანი ჩანაწერი (სამაგიდო, კურსი, ადგილი) */
  shape?: 'poster' | 'wide'
  /** ფოტოს გარეშე — მოდულის ხატულა */
  fallback: ReactNode
  /** პირველი რიგი: სტატუსი, ქულა, ხილვადობა */
  badges?: ReactNode
  /** ჟანრის ჩიპები, მოკლე ცნობები (`DetailFacts`) */
  children?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 sm:flex-row">
      <div
        className={cn(
          'mx-auto grid shrink-0 place-items-center overflow-hidden rounded-lg bg-muted ring-1 ring-border sm:mx-0',
          shape === 'poster' ? 'aspect-[3/4] w-32' : 'aspect-video w-56',
        )}
      >
        {image ? <img src={image} alt={alt} className="size-full object-cover" /> : fallback}
      </div>

      <div className="min-w-0 flex-1 space-y-2.5">
        {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
        {children}
      </div>
    </section>
  )
}

/** მოკლე ცნობები — ერთი ხაზი, რომელიც საჭიროებისას გადადის */
export function DetailFacts({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">{children}</div>
}

/** ფანჯრის სექცია — სათაური, ახსნა (`i`) და მარჯვენა მოქმედება */
export function DetailSection({
  title,
  hint,
  icon,
  action,
  className,
  children,
}: {
  title: string
  hint?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          {icon}
          {title}
          <InfoHint info={hint} />
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * **ფოტოები — ზემოთ და დიდად** (§22.2 → §26.4): ვიტრინა (პირველი დიდად,
 * დანარჩენი ზოლად, დაჭერით — სრულ ეკრანზე) + ატვირთვა სექციის სათაურში.
 *
 * ⚠️ **საჯარო დისკისთვისაა** (`PhotoShowcase` → `storageUrl`) — ჩანაწერის
 * (note) ფოტოები პრივატულია და თავის `NoteUploads`-ში რჩება.
 * ⚠️ წაშლა ყოველთვის დადასტურებით — ერთი დაჭერა ფოტოს არ უნდა კარგავდეს.
 */
export function DetailPhotos({
  title,
  hint,
  items,
  loading,
  uploading,
  onUpload,
  onDelete,
  uploadLabel,
  emptyTitle,
  deleteTitle,
}: {
  title: string
  hint?: string
  items: ShowcaseItem[]
  loading?: boolean
  uploading?: boolean
  onUpload: (files: File[]) => void
  /** დადასტურების **შემდეგ** იძახება */
  onDelete: (id: number) => void
  uploadLabel: string
  emptyTitle: string
  deleteTitle: string
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)

  return (
    <DetailSection
      title={title}
      hint={hint}
      action={
        <Button variant="outline" size="sm" disabled={uploading} onClick={() => input.current?.click()}>
          <Upload className="size-3.5" />
          {uploading ? t('actions.saving') : uploadLabel}
        </Button>
      }
    >
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="image/*"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length) onUpload(picked)
          e.target.value = ''
        }}
      />

      <PhotoShowcase
        items={items}
        empty={loading ? null : <EmptyState icon={<ImageIcon className="size-6" />} title={emptyTitle} />}
        onDelete={async (id) => {
          if (await confirm({ title: deleteTitle, variant: 'destructive' })) onDelete(id)
        }}
      />
    </DetailSection>
  )
}
