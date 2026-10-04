import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { deleteDutyWorkplace, type DutyWorkplace } from '@/api/duty'
import { errorMessage } from '@/lib/errors'
import { invalidateDuty } from '@/lib/duty'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   **სამსახურის წაშლა — მისი მორიგეობების ბედი (Tasks §34).**

   კლასიფიკატორის სამი ცხადი არჩევანი (`/dictionaries`-ის იგივე ფანჯარა და
   სიტყვები): სხვა სამსახურზე გადატანა · უსამსახუროდ დატოვება · მორიგეობების
   წაშლაც (ურნაში, „DELETE“-ის აკრეფით). სამსახური თვითონ ურნაში მიდის და
   აღდგენისას გადატანილების დაბრუნებას გთავაზობს.
   ============================================================ */

type Mode = 'reassign' | 'empty' | 'delete'

const CONFIRM_WORD = 'DELETE'

export function DutyWorkplaceDeleteDialog({
  workplace,
  others,
  onClose,
}: {
  workplace: DutyWorkplace
  others: DutyWorkplace[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const count = workplace.shifts_count
  const [mode, setMode] = useState<Mode>(others.length ? 'reassign' : 'empty')
  const [moveTo, setMoveTo] = useState('')
  const [confirmWord, setConfirmWord] = useState('')

  const remove = useMutation({
    mutationFn: () =>
      deleteDutyWorkplace(
        workplace.id,
        mode === 'delete' ? { deleteRecords: true } : mode === 'reassign' && moveTo ? { moveTo: Number(moveTo) } : { clearRecords: true },
      ),
    onSuccess: ({ moved, deleted }) => {
      invalidateDuty(qc)
      toast({
        title: deleted
          ? t('dictionaries.recordsDeleted', { count: deleted })
          : moved
            ? t('dictionaries.moved', { count: moved })
            : t('dictionaries.deleted'),
        variant: 'success',
      })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const disabled =
    remove.isPending ||
    (count > 0 && mode === 'reassign' && (!others.length || !moveTo)) ||
    (count > 0 && mode === 'delete' && confirmWord.trim() !== CONFIRM_WORD)

  return (
    <ModalShell title={t('duty.workplace.deleteTitle')} onClose={onClose} destructive>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dictionaries.deleteSimple', { name: workplace.name })}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('duty.workplace.inUse', { name: workplace.name, count })}</p>

          <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-3">
            <div
              className={cn(
                'rounded-lg border p-3',
                mode === 'reassign' ? 'border-primary bg-secondary/50' : 'border-border',
                !others.length && 'pointer-events-none opacity-50',
              )}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <RadioGroupItem value="reassign" disabled={!others.length} />
                <span className="text-sm font-medium">{t('dictionaries.moveTo')}</span>
              </label>
              {mode === 'reassign' && others.length > 0 && (
                <div className="mt-2 pl-8">
                  <Select value={moveTo} onValueChange={setMoveTo}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('dictionaries.movePick')} />
                    </SelectTrigger>
                    <SelectContent>
                      {others.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border p-3',
                mode === 'empty' ? 'border-primary bg-secondary/50' : 'border-border',
              )}
            >
              <RadioGroupItem value="empty" />
              <span className="text-sm font-medium">{t('duty.workplace.leaveEmpty')}</span>
            </label>

            <div className={cn('rounded-lg border p-3', mode === 'delete' ? 'border-destructive bg-destructive/5' : 'border-border')}>
              <label className="flex cursor-pointer items-center gap-3">
                <RadioGroupItem value="delete" />
                <span className="text-sm font-medium text-destructive">{t('dictionaries.deleteRecords', { count })}</span>
              </label>
              {mode === 'delete' && (
                <div className="mt-2 space-y-2 pl-8">
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <span>{t('dictionaries.deleteRecordsWarning', { count })}</span>
                  </p>
                  <Label htmlFor="duty-wp-delete-confirm">{t('dictionaries.confirmLabel', { word: CONFIRM_WORD })}</Label>
                  <Input
                    id="duty-wp-delete-confirm"
                    value={confirmWord}
                    onChange={(e) => setConfirmWord(e.target.value)}
                    placeholder={CONFIRM_WORD}
                    autoComplete="off"
                  />
                </div>
              )}
            </div>
          </RadioGroup>
        </div>
      )}

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button variant="destructive" disabled={disabled} onClick={() => remove.mutate()}>
          <Trash2 className="size-4" />
          {t('actions.delete')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
