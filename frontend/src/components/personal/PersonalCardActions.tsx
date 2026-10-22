import { useTranslation } from 'react-i18next'
import { LockOpen, Maximize2, SquarePen, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RecordActionMenu, type MenuAction } from '@/components/ui/record-menu'

/**
 * **ბარათის ღილაკები** — პიროვნებისა და ალბომის ბარათზე ერთნაირი: სამი `h-9`
 * ტექსტით (გახსნა · რედაქტირება · წაშლა) + `⋯`; დამალულზე — „გახსნა" (პაროლი) + `⋯`.
 */
export function CardActions({
  hidden,
  menu,
  onUnlock,
  onOpen,
  onEdit,
  onDelete,
}: {
  hidden: boolean
  menu: MenuAction[]
  onUnlock: () => void
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()

  return (
    <>
      {hidden ? (
        <Button variant="outline" size="sm" className="min-w-0 flex-1" onClick={onUnlock}>
          <LockOpen className="size-3.5" />
          <span className="truncate">{t('lock.unlock')}</span>
        </Button>
      ) : (
        <>
          <Button variant="outline" size="sm" className="min-w-0 flex-1" onClick={onOpen}>
            <Maximize2 className="size-3.5" />
            <span className="truncate">{t('actions.open')}</span>
          </Button>
          <Button variant="edit" size="sm" className="min-w-0 flex-1" onClick={onEdit}>
            <SquarePen className="size-3.5" />
            <span className="truncate">{t('actions.edit')}</span>
          </Button>
          <Button variant="destructiveOutline" size="sm" className="min-w-0 flex-1" onClick={onDelete}>
            <Trash2 className="size-3.5" />
            <span className="truncate">{t('confirm.delete')}</span>
          </Button>
        </>
      )}
      <RecordActionMenu actions={menu} label={t('actions.more')} />
    </>
  )
}
