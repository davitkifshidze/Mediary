import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateActorTags } from '@/api/media'
import { ACTORS_KEY } from '@/api/actors'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { FormField } from '@/components/ui/form-layout'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { TagSelect } from '@/components/TagSelect'

/* ============================================================
   **მსახიობის ტეგები `/actors`-ის მენიუდან.**

   იგივე ტეგებია, რაც მსახიობის გვერდის „ფოტოები ვებიდან"-ში — ⚠️ ჩემია
   და არა გლობალური. შენახვა ორივე ადგილს ანახლებს (სია და მსახიობის გვერდი).
   ============================================================ */

export function ActorTagsDialog({
  actorId,
  name,
  tags: initial,
  options,
  onClose,
}: {
  actorId: number
  name: string
  tags: string[]
  /** შეთავაზება — ჩემი ტეგები სხვა მსახიობებზე */
  options: string[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [tags, setTags] = useState(initial)

  const save = useMutation({
    mutationFn: () => updateActorTags(actorId, tags),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ACTORS_KEY] })
      qc.invalidateQueries({ queryKey: ['actor', String(actorId)] })
      toast({ title: t('toast.saved'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('actors.tagsTitle', { name })} onClose={onClose}>
      <FormField label={t('web.actorTags')} hint={t('web.actorTagsHint')}>
        <TagSelect options={options} value={tags} onChange={setTags} placeholder={t('web.actorTagsPlaceholder')} />
      </FormField>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {t('actions.save')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
