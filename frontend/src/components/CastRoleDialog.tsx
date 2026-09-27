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
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   როლის შესწორება (ეტაპი 1, 2026-09-13 → Tasks §16).

   ⚠️ **ეს pivot-ის რედაქტირებაა და არა მსახიობისა.** როლი („ვის თამაშობს")
   ჩანაწერსა და ადამიანს **შორისაა** (`castables.character`), ე.ი. იგივე
   მსახიობს სხვა ფილმზე სხვა როლი აქვს. ამიტომ აქ სახელი არ იცვლება —
   `cast_members` გლობალური ლექსიკონია და მისი გადარქმევა ყველა ანგარიშს
   შეეხებოდა.

   ⚠️ **შენახული როლი შენია**: სერვერი მას `is_edited`-ით ინიშნავს და
   სინქრონიზაცია მას TMDB-ის როლს აღარ აწერს.

   ⚠️ **რიგის რიცხვითი ველი აქ აღარ არის (Tasks §16).** ის ერთადერთი გზა
   იყო, რომ ხელით დამატებული სიის თავში აღმოჩენილიყო; ახლა ამას drag & drop
   და „ერთით წინ/უკან" აკეთებს, რომლებიც მთელ სიას ერთად წერენ (`0..n-1`).
   რიცხვის ველი ორ ადამიანს ერთსა და იმავე ნომერს მისცემდა და „ვინ დგას
   წინ" შემთხვევითი გახდებოდა — ორი მექანიზმი ერთ ფაქტზე.
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

  const save = useMutation({
    mutationFn: () => updateRecordCast(type, recordId, member.id, { character: character.trim() || null }),
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
      </div>

      <ModalFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          {t('actions.save')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
