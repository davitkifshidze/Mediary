import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { drillChips, drillLabel, useDrillParams, type DrillChip } from '@/lib/statsLinks'
import { Chip } from '@/components/ui/chip'

/* ============================================================
   **სტატისტიკიდან მოსული ჭრილი სიაზე** — „თვე: მარტი 2026",
   „გამოსვლის წელი: 2011", „ჩემი ქულა: 7"; დაჭერით (✕) იხსნება.

   ⚠️ ფილტრის პანელს ამ ჭრილის ველი არ აქვს — ჩიპის გარეშე სია აუხსნელად
   იქნებოდა გაფილტრული. ⚠️ `FilterTrigger`-ის გვერდით იხატება: ის ყველა
   სიის ზოლშია, ე.ი. თითო გვერდზე ცალკე ჩასმა არ სჭირდება.
   ============================================================ */

export function DrillChips({ except = [] }: { except?: readonly string[] }) {
  const { t } = useTranslation()
  const [, setParams] = useSearchParams()
  const chips = drillChips(useDrillParams(except))

  if (!chips.length) return null

  const remove = (chip: DrillChip) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      chip.keys.forEach((key) => next.delete(key))
      next.delete('page')
      return next
    })

  return (
    <>
      {chips.map((chip) => (
        <Chip key={chip.kind} active remove title={t('drill.remove')} onClick={() => remove(chip)} data-drill={chip.kind}>
          {drillLabel(chip, t)}
        </Chip>
      ))}
    </>
  )
}
