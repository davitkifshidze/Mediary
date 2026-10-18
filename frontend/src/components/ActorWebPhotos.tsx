import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, Loader2, Save } from 'lucide-react'
import { updateActorTags } from '@/api/media'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { FieldLabel } from '@/components/ui/field-label'
import { useToast } from '@/components/ui/feedback'
import { TagSelect } from '@/components/TagSelect'
import { WebImageDialog } from '@/components/WebImageDialog'

/* ============================================================
   მსახიობის ფოტოები ვებიდან, ტეგებით.

   ⚠️ **ტეგი აქ „რა შინაარსის ფოტო მინდა"-ა** და არა კლასიფიკაცია: ის
   პირდაპირ ძებნის შეკითხვაში მიდის („Keanu Reeves" + „პორტრეტი"). სწორედ
   ამიტომ ინახება — ერთხელ გაწერილი ტეგით მეორედაც იძებნება.

   ⚠️ **ტეგები მომხმარებლისაა** — `cast_members` გლობალური ლექსიკონია
   (ერთი მსახიობი ყველა ანგარიშზე ერთი რიგია), ე.ი. ჩემი „წითელი ხალიჩა"
   სხვის გვერდზე არ უნდა გამოჩნდეს.

   ⚠️ **ძებნა მხოლოდ ღილაკზე** — 250 ძებნაა თვეში მთელ ანგარიშზე, ე.ი. არც
   ტეგის შეცვლა და არც გვერდის გახსნა არაფერს ხარჯავს.

   ⚠️ **ცენზურა გამორთულია** (`safe=off`) — შენი პირობა: რასაც ტეგში წერ,
   ის ჩამოიწეროს.
   ============================================================ */

export function ActorWebPhotos({
  actorId,
  actorName,
  tags: initial,
  onImported,
}: {
  actorId: number
  actorName: string
  tags: string[]
  onImported?: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()

  const [tags, setTags] = useState<string[]>(initial)
  const [open, setOpen] = useState(false)

  // სხვა მსახიობზე გადასვლისას სია თავიდან უნდა აეწყოს
  useEffect(() => setTags(initial), [actorId, initial])

  const dirty = tags.join('\x00') !== initial.join('\x00')

  const save = useMutation({
    mutationFn: () => updateActorTags(actorId, tags),
    onSuccess: (saved) => {
      setTags(saved)
      qc.invalidateQueries({ queryKey: ['actor', String(actorId)] })
      toast({ title: t('toast.saved'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  // შეკითხვა = სახელი + ტეგები. ⚠️ **ტეგების გარეშეც მუშაობს** — მაშინ
  // უბრალოდ სახელით იძებნება და არა „ვერაფერს ვეძებ"-ით.
  const query = [actorName, ...tags].join(' ').trim()

  return (
    <section className="mb-10 rounded-xl border border-border bg-card/40 p-4">
      <FieldLabel hint={t('web.actorTagsHint')}>{t('web.actorTags')}</FieldLabel>

      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <TagSelect
            options={initial}
            value={tags}
            onChange={setTags}
            placeholder={t('web.actorTagsPlaceholder')}
          />
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {t('actions.save')}
          </Button>

          <Button type="button" onClick={() => setOpen(true)}>
            <Globe className="size-4" />
            {t('web.searchPhotos')}
          </Button>
        </div>
      </div>

      {open && (
        <WebImageDialog
          target="cast_member"
          id={actorId}
          initialQuery={query}
          title={t('web.searchPhotosFor', { name: actorName })}
          // აქ კონტექსტი თვითონ მსახიობია და ფოტოც მას მიება
          context={{ base: actorName, attachesTo: actorName }}
          onClose={() => setOpen(false)}
          onImported={() => {
            qc.invalidateQueries({ queryKey: ['gallery', 'cast', actorId] })
            onImported?.()
          }}
        />
      )}
    </section>
  )
}
