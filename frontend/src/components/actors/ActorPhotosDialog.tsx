import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ExternalLink, X } from 'lucide-react'
import { ActorGallery } from '@/components/RecordGallery'
import { Button, buttonVariants } from '@/components/ui/button'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'

/* ============================================================
   **მსახიობის ფოტოები დიდ ფანჯარაში** — „გალერეის" ხედის დასტაზე დაჭერა.

   ⚠️ შიგთავსი მსახიობის გვერდის იგივე გალერეაა (`ActorGallery`): ფოტოები გვერდებად,
   „გვერდზე რამდენი", ფოტოზე დაჭერით სლაიდერი, ვიდეო-ბმულები და ჩამოტვირთვა — ორი
   ასლი ერთ დღეს გაშორდებოდა. ფანჯარა მხოლოდ იმას ამატებს, რომ სიიდან გასვლა არ გჭირდება.
   ============================================================ */

export function ActorPhotosDialog({ actorId, name, onClose }: { actorId: number; name: string; onClose: () => void }) {
  const { t } = useTranslation()

  return (
    <ModalShell size="full" title={name} onClose={onClose}>
      <div data-testid="actor-photos-dialog">
        <ActorGallery castId={actorId} actorName={name} bare />
      </div>

      <ModalFooter>
        <Link to={`/actors/${actorId}`} onClick={onClose} className={buttonVariants({ variant: 'outline' })}>
          <ExternalLink className="size-4" />
          {t('actors.openPage')}
        </Link>
        <Button type="button" onClick={onClose}>
          <X className="size-4" />
          {t('actions.close')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
