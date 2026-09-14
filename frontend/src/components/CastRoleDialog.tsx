import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { updateRecordCast } from '@/api/cast'
import type { CastMember } from '@/api/types'
import { errorMessage } from '@/lib/errors'
import type { MediaType } from '@/lib/media'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   როლის და რიგის შესწორება (ეტაპი 1, 2026-09-13).

   ⚠️ **ეს pivot-ის რედაქტირებაა და არა მსახიობისა.** როლი („ვის თამაშობს")
   ჩანაწერსა და ადამიანს **შორისაა** (`castables.character`), ე.ი. იგივე
   მსახიობს სხვა ფილმზე სხვა როლი აქვს. ამიტომ აქ სახელი არ იცვლება —
   `cast_members` გლობალური ლექსიკონია და მისი გადარქმევა ყველა ანგარიშს
   შეეხებოდა.

   ⚠️ **რიგიც აქვეა**: TMDB-ის `billing_order` კრედიტების თანმიმდევრობაა
   და ხელით დამატებული ბოლოში ჯდება — თუ ის მთავარი მსახიობია, რიცხვის
   შეცვლა ერთადერთი გზაა, რომ სიის თავში აღმოჩნდეს.
   ============================================================ */

export function CastRoleDialog({
  type,
  recordId,
  member,
  onClose,
  onSaved,
}: {
  type: MediaType
  recordId: number
  member: CastMember
  onClose: () => void
  onSaved?: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [character, setCharacter] = useState(member.character ?? '')
  const [order, setOrder] = useState(String(member.billing_order ?? 0))

  const save = useMutation({
    mutationFn: () =>
      updateRecordCast(type, recordId, member.id, {
        character: character.trim() || null,
        billing_order: Number(order) || 0,
      }),
    onSuccess: () => {
      toast({ title: t('toast.saved'), variant: 'success' })
      onSaved?.()
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('cast.editRoleTitle', { name: member.name_ka || member.name })} onClose={onClose}>
      <div className="mt-5 grid gap-3">
        <div>
          <Label htmlFor="cast-role">{t('cast.character')}</Label>
          <Input
            id="cast-role"
            autoFocus
            value={character}
            onChange={(e) => setCharacter(e.target.value)}
            placeholder={t('cast.characterPlaceholder')}
          />
        </div>
        <div>
          <Label htmlFor="cast-order">{t('cast.billingOrder')}</Label>
          <Input
            id="cast-order"
            type="number"
            min={0}
            max={999}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('cast.billingOrderHint')}</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {t('actions.save')}
        </Button>
      </div>
    </ModalShell>
  )
}
