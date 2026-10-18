import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { attachCastMember } from '@/api/cast'
import { ACTORS_KEY } from '@/api/actors'
import { emptyMediaIds, type MediaType } from '@/lib/media'
import { useModules } from '@/lib/modules'
import { errorMessage, isApiCode } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { FormField } from '@/components/ui/form-layout'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { MediaRecordPicker } from '@/components/MediaRecordPicker'

/* ============================================================
   **მსახიობის მიმაგრება ჩემს ჩანაწერებზე — მისივე გვერდიდან.**

   ჩანაწერზე მიბმის იგივე endpoint (`POST /media/cast/{type}/{id}`,
   `cast_member_id`-ით), ოღონდ ბევრ ჩანაწერზე ერთად. ⚠️ უკვე მიბმული (409
   `cast_already_attached`) შეცდომა არაა — ის უბრალოდ გამოტოვდება და რიცხვში
   ჩანს; სხვა ჩავარდნა ცალკე ითქმება.
   ============================================================ */

export function ActorAttachDialog({ actorId, name, onClose }: { actorId: number; name: string; onClose: () => void }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { mediaModules } = useModules()

  const types = mediaModules.map((m) => m.type)
  const [ids, setIds] = useState<Record<MediaType, number[]>>(() => emptyMediaIds())
  const picked = types.reduce((sum, type) => sum + (ids[type]?.length ?? 0), 0)

  const attach = useMutation({
    mutationFn: async () => {
      let added = 0
      let already = 0

      for (const type of types) {
        for (const id of ids[type] ?? []) {
          try {
            await attachCastMember(type, id, { cast_member_id: actorId })
            added++
          } catch (e) {
            if (isApiCode(e, 'cast_already_attached')) already++
            else throw e
          }
        }
      }

      return { added, already }
    },
    onSuccess: ({ added, already }) => {
      qc.invalidateQueries({ queryKey: ['actor', String(actorId)] })
      qc.invalidateQueries({ queryKey: [ACTORS_KEY] })
      toast({
        title: t('actors.attach.done', { count: added }),
        description: already ? t('actors.attach.already', { count: already }) : undefined,
        variant: 'success',
      })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('actors.attach.title', { name })} onClose={onClose} size="wide">
      <FormField label={t('actors.attach.records')} hint={t('actors.attach.hint')}>
        <MediaRecordPicker types={types} ids={ids} onChange={(type, next) => setIds((prev) => ({ ...prev, [type]: next }))} enabled />
      </FormField>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button onClick={() => attach.mutate()} disabled={!picked || attach.isPending}>
          {t('actors.attach.submit', { count: picked })}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
