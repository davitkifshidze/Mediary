import { useTranslation } from 'react-i18next'
import { CheckSquare, Library, Loader2, Send } from 'lucide-react'
import type { ShareAbility, ShareStatusMode } from '@/api/shareLinks'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   **„ჩემს ბიბლიოთეკაში დამატება" — სექციის რიგი** გაზიარების ბმულისა და
   საჯარო პროფილის გვერდზე.

   სამი მდგომარეობა, მნახველის უფლებით (`ability` სერვერიდან მოდის — ეს
   გვერდები `ModulesProvider`-ის გარეთაა):
    · მოდული არ აქვს — მიზეზი და „მოდულის მოთხოვნა";
    · მოდული აქვს, დამატების უფლება — არა — მიზეზი;
    · შეუძლია — „რა სტატუსით დაემატოს" · „ყველა ახლის მონიშვნა" ·
      „მონიშნულის დამატება (N)" · „ყველა ახლის დამატება".
   ⚠️ სტატუსის არჩევანი მხოლოდ მაშინ ჩანს, როცა წყარო მფლობელის სტატუსს
   აჩვენებს (`ownerStatus`) — სხვაგვარად „როგორც მას აქვს" ცარიელი სიტყვაა.
   ============================================================ */

export function LibraryImportBar({
  ability,
  sectionName,
  hint,
  ownerStatus,
  ownerStatusLabel,
  statusMode,
  onStatusMode,
  freshCount,
  selectedCount,
  onToggleAll,
  onAddSelected,
  onAddAll,
  adding,
  onRequestModule,
  requesting,
}: {
  ability: ShareAbility
  sectionName: string
  hint: string
  ownerStatus: boolean
  ownerStatusLabel: string
  statusMode: ShareStatusMode
  onStatusMode: (mode: ShareStatusMode) => void
  /** ჩატვირთული ბარათებიდან რამდენი არ გაქვს */
  freshCount: number
  selectedCount: number
  onToggleAll: () => void
  onAddSelected: () => void
  onAddAll: () => void
  adding: boolean
  onRequestModule: () => void
  requesting: boolean
}) {
  const { t } = useTranslation()

  if (!ability.enabled) {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <p className="min-w-0 flex-1 text-sm">{t('share.page.noModule', { module: sectionName })}</p>
        <Button size="sm" disabled={ability.requested || requesting} onClick={onRequestModule}>
          <Send className="size-4" />
          {t(ability.requested ? 'share.page.requestSent' : 'share.page.requestModule')}
        </Button>
      </div>
    )
  }

  if (!ability.can_create) {
    return (
      <p className="mb-5 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        {t('share.page.noCreateRight', { module: sectionName })}
      </p>
    )
  }

  const allSelected = freshCount > 0 && selectedCount === freshCount

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
      <Library className="size-4 text-muted-foreground" />
      <span className="text-sm font-medium">{t('share.page.addTitle')}</span>
      <InfoHint info={hint} />
      <div className="flex-1" />
      {ownerStatus && (
        <Select value={statusMode} onValueChange={(v) => onStatusMode(v as ShareStatusMode)}>
          <SelectTrigger className="w-60" aria-label={t('share.page.statusMode')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{t('share.page.statusDefault')}</SelectItem>
            <SelectItem value="owner">{ownerStatusLabel}</SelectItem>
          </SelectContent>
        </Select>
      )}
      {freshCount > 0 && (
        <Button size="sm" variant="outline" onClick={onToggleAll}>
          <CheckSquare className="size-4" />
          {t(allSelected ? 'share.page.unselectAll' : 'share.page.selectNew')}
        </Button>
      )}
      <Button size="sm" variant="outline" disabled={selectedCount === 0 || adding} onClick={onAddSelected}>
        {t('share.page.addSelected', { count: selectedCount })}
      </Button>
      <Button size="sm" disabled={adding} onClick={onAddAll}>
        {adding ? <Loader2 className="size-4 animate-spin" /> : <Library className="size-4" />}
        {t('share.page.addAllNew')}
      </Button>
    </div>
  )
}
