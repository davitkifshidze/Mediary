import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip, SquarePen, Trash2, type LucideIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { cn } from '@/lib/utils'

/* ============================================================
   **სიის რიგის მოქმედებების ზოლი — ერთი ყველა მოდულზე** (Tasks §29.1).

   შენი სიტყვები: „რჩეული, ფაილები, ბმული და სტატუსებიც საშინელებაა; ერთ
   სტილში მინდა, შესაბამისი სახელებით, აიქონებით და ფერებით" · „ერთი სტილის
   და ერთი ფერის სიმეტრიული ღილაკები".

   რიგი და ზომა **ფიქსირებულია**: [ბეჯები] · სტატუსი (§16.4 ჩამოსაშლელი,
   `min-w-36`) · რჩეული (§8) · ფაილები (`Paperclip` + „ფაილები" + რიცხვი) ·
   ბმული/რუკა (აიქონი + ტექსტი) · რედაქტირება (`variant="edit"`) · წაშლა
   (წითელი). ყველა `h-9`, `items-center`.

   ⚠️ **ბმულის სლოტი ყოველთვის ადგილზეა** (§14.2): უბმულო ჩანაწერზე იგივე
   ზომის უხილავი ელემენტია, რომ რედაქტირება და წაშლა რიგიდან რიგში არ
   ინაცვლებდეს. აქამდე ზოგ სიაში (თამაში, სამაგიდო) ის პირობითად ჩნდებოდა
   და ღილაკები „ხტებოდა".

   ⚠️ **აიქონ-ბმული `size-9` აღარ არსებობს** — „ბმული"/„რუკა" ტექსტითაა,
   `outline sm` ღილაკის ფორმით (icon-only row actions დახურული გადაწყვეტილებაა).
   წაშლა ერთადერთი აიქონ-ღილაკია და ის ყველგან ასეა (ჩანაწერები, ბუკმარკები).

   ⚠️ **სტატუსი ჩანაწერის ტიპზეა დამოკიდებული** (enum ან ლექსიკონი), ამიტომ
   ზოლი მას მზა ელემენტად იღებს (`EnumStatusMenu`) და თვითონ არ ხატავს.
   ============================================================ */

export interface ActionBarLink {
  /** `null`/ცარიელი — სლოტი რჩება, მაგრამ უხილავია */
  href: string | null | undefined
  label: string
  icon: LucideIcon
  title?: string
  /** Tasks §36.2 — დაჭერისას (ბუკმარკის „გახსნის" მთვლელი); ბმული მაინც ახალ ჩანართში იხსნება */
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
  /** ზოლის დასაწყისი — ქულა, ვიზიტები, BGG და სხვა ბეჯები */
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
          {files.count > 0 && (
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs leading-none tabular-nums text-foreground">
              {files.count}
            </span>
          )}
        </Button>
      )}
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
      <Button type="button" variant="edit" size="sm" onClick={onEdit}>
        <SquarePen className="size-3.5" />
        {t('actions.edit')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive"
        aria-label={t('actions.delete')}
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
