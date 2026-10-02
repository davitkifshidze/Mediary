import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share2 } from 'lucide-react'
import type { ShareDomainKey, ShareDomainSpec } from '@/api/shareLinks'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShareLinkDialog } from '@/components/share/ShareLinkDialog'

/* ============================================================
   **„ამ სიის გაზიარება" — ერთი ღილაკი ცხრა გვერდზე** (Tasks §40.4 → §40.10).

   ფანჯარა ამ სექციითა და მიმდინარე ფილტრით იხსნება (`librarySpec()`).
   ⚠️ ღილაკი, მისი ახსნა და ფანჯრის მდგომარეობა აქ ერთადაა — ცხრა გვერდზე
   ერთი და იგივე ოცი ხაზი ცხრაჯერ ეწერებოდა და პირველივე ცვლილება რვაში
   დარჩებოდა. ⚠️ ფილტრის ჩამრთველის გვერდით დგას, რადგან ბმულის ფარგალი
   სწორედ ეს ფილტრია; `spec` ფანჯარამ მხოლოდ გახსნისას იცის — მერე მისი
   ფორმა თავისით იცვლება.
   ============================================================ */

export function ShareListButton({ domain, spec }: { domain: ShareDomainKey; spec: ShareDomainSpec }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" onClick={() => setOpen(true)} aria-label={t('share.shareList')}>
            <Share2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm">
          <p className="font-medium">{t('share.shareList')}</p>
          <p className="mt-1 text-muted-foreground">{t('share.shareListHint')}</p>
        </TooltipContent>
      </Tooltip>

      {open && <ShareLinkDialog initial={{ domain, spec }} onClose={() => setOpen(false)} />}
    </>
  )
}
