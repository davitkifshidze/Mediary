import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip, SquarePen, Trash2, type LucideIcon } from 'lucide-react'
import { CountBadge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { cn } from '@/lib/utils'

/* ============================================================
   **სიის რიგის მოქმედებების ზოლი — ერთი ყველა მოდულზე**.

   შენი სიტყვები: „რჩეული, ფაილები, ბმული და სტატუსებიც საშინელებაა; ერთ
   სტილში მინდა, შესაბამისი სახელებით, აიქონებით და ფერებით" · „ერთი სტილის
   და ერთი ფერის სიმეტრიული ღილაკები".

   რიგი და ზომა **ფიქსირებულია**: [ბეჯები] · ბმული/რუკა (აიქონი + ტექსტი) ·
   სტატუსი (ჩამოსაშლელი, `min-w-36`) · რჩეული · ფაილები (`Paperclip`
   + „ფაილები" + `CountBadge`) · რედაქტირება (`variant="edit"`) · წაშლა
   (`destructiveOutline`, აიქონი + „წაშლა"). ყველა `h-9`, `items-center`.

   ⚠️ **ბმულის სლოტი ყოველთვის ადგილზეა**: უბმულო ჩანაწერზე იგივე
   ზომის უხილავი ელემენტია, რომ რედაქტირება და წაშლა რიგიდან რიგში არ
   ინაცვლებდეს.
   ⚠️ **ქრობადი ყველაფერი რიგის თავშია, სათაურის მხარეს** — ჯერ ბეჯები
   (შეფასება, BGG, ვიზიტები: უშეფასებოზე `null`-ია), მერე ბმულის სლოტი
   (უბმულოზე უხილავი). შუაში მდგარი ბეჯი უშეფასებო ჩანაწერზე „რუკასა" და
   სტატუსს შორის ხვრელს ტოვებდა; ახლა მარჯვნივ მიმაგრებული „ბმული · სტატუსი ·
   რჩეული · ფაილები · რედაქტირება · წაშლა" ყოველთვის ერთმანეთის გვერდით და
   რიგიდან რიგში ერთ ადგილზე დგას.
   ⚠️ **ფაილების რიცხვი 0-ზეც იხატება** (`CountBadge`) — ფაილიანი და უფაილო
   რიგის ღილაკი ერთი სიგანისაა.

   ⚠️ **აიქონ-ღილაკი რიგში აღარ არის** — წაშლაც ტექსტითაა, როგორც
   რედაქტირება (icon-only row actions დახურული გადაწყვეტილებაა); `aria-label`
   რჩება. `scripts/action-rows.mjs` რიგში `size="icon"`-სა და ghost-წაშლას აგდებს.

   ⚠️ **სტატუსი ჩანაწერის ტიპზეა დამოკიდებული** (enum ან ლექსიკონი), ამიტომ
   ზოლი მას მზა ელემენტად იღებს (`EnumStatusMenu`) და თვითონ არ ხატავს.
   ============================================================ */

export interface ActionBarLink {
  /** `null`/ცარიელი — სლოტი რჩება, მაგრამ უხილავია */
  href: string | null | undefined
  label: string
  icon: LucideIcon
  title?: string
  /** დაჭერისას (ბუკმარკის „გახსნის" მთვლელი); ბმული მაინც ახალ ჩანართში იხსნება */
  onOpen?: () => void
}

export function RecordActionBar({
  before,
  status,
  favorite,
  files,
  link,
  onEdit,
  onDelete,
  className,
}: {
  /** ზოლის დასაწყისი, ბმულის წინ — ქულა, BGG და სხვა ქრობადი ბეჯები */
  before?: ReactNode
  /** სტატუსის ჩამოსაშლელი (`EnumStatusMenu` ან ლექსიკონის ვარიანტი) */
  status?: ReactNode
  favorite?: { active: boolean; pending?: boolean; onToggle: () => void }
  /** ფაილების ღილაკი — დეტალის ფანჯარას ხსნის, რიცხვი ბეჯად */
  files?: { count: number; onOpen: () => void }
  link?: ActionBarLink
  onEdit: () => void
  onDelete: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const LinkIcon = link?.icon

  return (
    <div className={cn('flex shrink-0 items-center gap-1', className)} data-testid="record-actions">
      {before}
      {link && LinkIcon && (
        <a
          href={link.href || undefined}
          target="_blank"
          rel="noopener noreferrer"
          title={link.title}
          aria-hidden={link.href ? undefined : true}
          tabIndex={link.href ? undefined : -1}
          onClick={link.href ? link.onOpen : undefined}
          data-testid="link-slot"
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'text-muted-foreground',
            !link.href && 'invisible pointer-events-none',
          )}
        >
          <LinkIcon className="size-3.5" />
          {link.label}
        </a>
      )}
      {status}
      {favorite && <FavoriteButton active={favorite.active} pending={favorite.pending} onToggle={favorite.onToggle} />}
      {files && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-muted-foreground"
          onClick={files.onOpen}
          data-testid="files-button"
        >
          <Paperclip className="size-3.5" />
          {t('actions.files')}
          <CountBadge count={files.count} />
        </Button>
      )}
      <Button type="button" variant="edit" size="sm" onClick={onEdit}>
        <SquarePen className="size-3.5" />
        {t('actions.edit')}
      </Button>
      <Button type="button" variant="destructiveOutline" size="sm" aria-label={t('actions.delete')} onClick={onDelete}>
        <Trash2 className="size-3.5" />
        {t('actions.delete')}
      </Button>
    </div>
  )
}
