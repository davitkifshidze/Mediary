import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Library, Plus } from 'lucide-react'
import { saveSharedRecord, type SharedRecord } from '@/api/chat'
import { errorMessage } from '@/lib/errors'
import { useModules } from '@/lib/modules'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   გაზიარებული ჩანაწერი ჩატში (FEAT-13).

   ⚠️ **`card === null` ორ სხვადასხვა მიზეზს ნიშნავს** — ჩანაწერი პირადია,
   ან უკვე აღარ არსებობს — და ინტერფეისს ორივეზე ერთი და იგივე აქვს
   სათქმელი: „მხოლოდ სათაური". მიზეზის გარჩევა მიმღებს არაფერს მისცემდა,
   სამაგიეროდ იმას გაამხელდა, რაც დამალულია.

   ⚠️ **„დამატება" მაშინაც მუშაობს, როცა ბარათი არ ჩანს.** იდენტობა
   (`tmdb_id`, `url`…) ყოველთვის მოდის — სწორედ ეს არის გაზიარების აზრი:
   „ეს ნახე" პირად ჩანაწერზეც რეკომენდაციაა.
   ============================================================ */

export function SharedRecordCard({
  messageId,
  record,
  mine,
}: {
  messageId: number
  record: SharedRecord
  mine: boolean
}) {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { enabled } = useModules()

  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const module = enabled.find((m) => m.key === record.domain)
  const card = record.card
  const poster = card?.poster_url ?? card?.cover_url ?? card?.image_url ?? card?.thumbnail_url ?? null

  const title =
    (i18n.language === 'ka' ? card?.title_ka : card?.title_en) ||
    card?.title_en ||
    card?.title_ka ||
    record.title

  const save = async () => {
    setBusy(true)
    try {
      const res = await saveSharedRecord(messageId)
      setSaved(true)
      toast({
        title: res.created ? t('chat.recordAdded') : t('chat.recordAlready'),
        variant: 'success',
      })
      /* ⚠️ ყველა query უქმდება: ახალი ჩანაწერი თავის სექციაშიც, დეშბორდზეც
         და სტატისტიკაშიც ჩნდება — წერტილოვანი invalidate ერთ-ერთს
         აუცილებლად გამორჩებოდა. */
      queryClient.invalidateQueries()
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-w-80 items-start gap-3 rounded-md border border-black/10 bg-black/5 p-2.5">
      {/* ⚠️ პოსტერის ადგილი ყოველთვის იკავება — თორემ ბარათიანი და
          ბარათის გარეშე წერილი სხვადასხვა სიგანის იქნებოდა და რიგი
          ერთმანეთს ასცდებოდა. */}
      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-black/10 [&>svg]:size-5 [&>svg]:opacity-60">
        {poster ? (
          <img src={poster} alt="" className="size-full object-cover" />
        ) : (
          <ModuleIcon name={module?.icon} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[11px] opacity-70">
          <Library className="size-3" />
          {module ? (i18n.language === 'ka' ? module.name_ka : module.name_en) : record.domain}
          {card?.year ? ` · ${card.year}` : ''}
        </span>

        <span className="mt-0.5 block text-sm font-medium leading-snug">{title}</span>

        {/* ⚠️ ავტორს „დაამატე ჩემთანაც" არ სჭირდება — ჩანაწერი მისია */}
        {!mine && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={busy || saved}
            onClick={save}
          >
            {saved ? <Check className="size-4" /> : <Plus className="size-4" />}
            {saved ? t('chat.recordSaved') : t('chat.recordAdd')}
          </Button>
        )}
      </span>
    </div>
  )
}
