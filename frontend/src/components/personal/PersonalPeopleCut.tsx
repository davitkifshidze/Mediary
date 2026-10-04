import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, LockOpen, SquarePen, Trash2, UserPlus } from 'lucide-react'
import { fetchPeople, isHidden, PERSONAL_KEY, reorderPeople, type Person } from '@/api/personal'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { countLabel, invalidatePersonal, privatePreview } from '@/lib/personal'
import { sortByIds } from '@/lib/reorder'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/feedback'
import { PhotoStack } from '@/components/ui/photo-stack'
import { contextMenuItems, MENU_ICONS } from '@/components/ui/record-menu'
import { Sortable, SortableItem } from '@/components/ui/sortable'
import { GalleryStackSkeleton } from '@/components/gallery/GalleryPhotoGrid'
import { PersonDialog } from '@/components/personal/PersonDialog'
import { PersonalDeleteDialog } from '@/components/personal/PersonalDeleteDialog'
import { LockBadge } from '@/components/locks/RecordLock'
import { PersonalUnlockDialog } from '@/components/personal/PersonalLock'

/* ============================================================
   **„ადამიანები" (Tasks §33.5)** — ბარათები: მთავარი ფოტო, სახელი,
   „N ფოტო · M ვიდეო", ალბომები; დაჭერა → ადამიანის გვერდი.

   ⚠️ **ვერტიკალური დასტაა** (`portrait`) — პორტრეტი, ალბომებისგან
   (ფართო კადრი) ერთი შეხედვით გასარჩევად. რიგი გადათრევით (§11).

   ⚠️ **ჩაკეტილი და დაუხსნელი ადამიანი ბოქლომიანი ბარათია** (§33.7): ყდა
   სერვერიდან არ მოდის, დაჭერა პაროლს ითხოვს, რედაქტირება/წაშლა კი გახსნამდე
   არ ჩანს (სერვერი მათ 423-ით უარყოფს).
   ============================================================ */

export function PersonalPeopleCut() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { date } = useDateFormat()

  const [editing, setEditing] = useState<{ person: Person | null } | null>(null)
  const [deleting, setDeleting] = useState<Person | null>(null)
  const [unlocking, setUnlocking] = useState<Person | null>(null)

  const peopleQ = useQuery({ queryKey: [PERSONAL_KEY, 'people'], queryFn: fetchPeople })

  const reorder = useMutation({
    mutationFn: reorderPeople,
    onMutate: (ids) => qc.setQueryData<Person[]>([PERSONAL_KEY, 'people'], (old) => (old ? sortByIds(old, ids, (p) => p.id) : old)),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
    onSettled: () => invalidatePersonal(qc),
  })

  const people = peopleQ.data ?? []
  const open = (person: Person) => navigate(`/personal/people/${person.id}`)

  const dialogs = (
    <>
      {editing && (
        <PersonDialog
          person={editing.person}
          onClose={() => setEditing(null)}
          onSaved={(saved) => (editing.person ? undefined : open(saved))}
        />
      )}
      {deleting && <PersonalDeleteDialog target={{ kind: 'person', person: deleting }} onClose={() => setDeleting(null)} />}
      {unlocking && (
        <PersonalUnlockDialog kind="people" record={unlocking} onClose={() => setUnlocking(null)} onUnlocked={() => open(unlocking)} />
      )}
    </>
  )

  if (peopleQ.isLoading) return <GalleryStackSkeleton />

  if (!people.length) {
    return (
      <>
        <EmptyState
          icon={<UserPlus className="size-6" />}
          title={t('personal.people.empty')}
          hint={t('personal.people.emptyHint')}
          actions={
            <Button size="sm" onClick={() => setEditing({ person: null })}>
              <UserPlus className="size-4" />
              {t('personal.person.add')}
            </Button>
          }
        />
        {dialogs}
      </>
    )
  }

  return (
    <section>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <Sortable ids={people.map((p) => p.id)} layout="grid" onReorder={(ids) => reorder.mutate(ids)}>
          {people.map((person) => {
            const hidden = isHidden(person)

            return (
              <SortableItem key={person.id} id={person.id}>
                <PhotoStack
                  title={person.name}
                  subtitle={person.birthday ? t('personal.person.born', { date: date(person.birthday) }) : undefined}
                  label={[
                    countLabel(t, person.photos, person.videos),
                    person.albums > 0 ? t('personal.albumsCount', { count: person.albums }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  count={person.photos + person.videos}
                  images={privatePreview(person.cover)}
                  aspect="portrait"
                  locked={hidden}
                  badge={person.locked ? <LockBadge hidden={hidden} /> : undefined}
                  onClick={() => (hidden ? setUnlocking(person) : open(person))}
                  menu={contextMenuItems(
                    hidden
                      ? [{ key: 'unlock', label: t('lock.unlock'), icon: LockOpen, run: () => setUnlocking(person) }]
                      : [
                          { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: () => open(person) },
                          { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing({ person }) },
                          { key: 'delete', label: t('confirm.delete'), icon: MENU_ICONS.delete, danger: true, run: () => setDeleting(person) },
                        ],
                  )}
                  actions={
                    hidden ? (
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setUnlocking(person)}>
                        <Lock className="size-3.5" />
                        {t('lock.unlock')}
                      </Button>
                    ) : (
                      <>
                        <Button variant="edit" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditing({ person })}>
                          <SquarePen className="size-3.5" />
                          {t('actions.edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-7 px-2 text-xs text-destructive"
                          onClick={() => setDeleting(person)}
                        >
                          <Trash2 className="size-3.5" />
                          {t('confirm.delete')}
                        </Button>
                      </>
                    )
                  }
                />
              </SortableItem>
            )
          })}
        </Sortable>
      </ul>

      {dialogs}
    </section>
  )
}

/** სათაურის ღილაკი — „ადამიანის დამატება" (გვერდი მას `actions`-ში სვამს) */
export function AddPersonButton() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        {t('personal.person.add')}
      </Button>
      {open && (
        <PersonDialog person={null} onClose={() => setOpen(false)} onSaved={(saved) => navigate(`/personal/people/${saved.id}`)} />
      )}
    </>
  )
}
