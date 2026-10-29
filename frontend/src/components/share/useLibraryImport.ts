import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { requestModule } from '@/api/account'
import type { ShareDomainKey, SharePlan, SharePlanItem, ShareStatusMode } from '@/api/shareLinks'
import { useToast } from '@/components/ui/feedback'
import { useQueue, type ShareImportSource } from '@/components/ui/queue'
import { errorMessage } from '@/lib/errors'
import { shareMeta } from '@/lib/shareLinks'

/**
 * **„ჩემს ბიბლიოთეკაში დამატების" მდგომარეობა** — მონიშვნა, სტატუსის რეჟიმი,
 * გეგმა → რიგი → ტოსტი და მოდულის მოთხოვნა. გაზიარების ბმულისა და საჯარო
 * პროფილის გვერდს ერთი ნაკადი აქვს; განსხვავდება მხოლოდ წყარო (`source`) და
 * გეგმის მისამართი (`plan`).
 *
 * ⚠️ **ურნაში მყოფიც რიგში მიდის** — სერვერი 409-ს აბრუნებს და რიგის მწკრივი
 * „აღდგენას" სთავაზობს; „უკვე გაქვს" კი არ მიდის — იქ საქმე არაფერია.
 * ⚠️ მოდულის მოთხოვნა **მოდულის** გასაღებით იგზავნება და არა დომენის:
 * პლეილისტი `song` მოდულშია.
 */
export function useLibraryImport({
  source,
  domain,
  lang,
  plan,
  headKey,
}: {
  source: ShareImportSource
  domain: ShareDomainKey | null
  lang: 'ka' | 'en'
  plan: (domain: ShareDomainKey, ids?: number[]) => Promise<SharePlan>
  /** გვერდის თავის query — მოდულის მოთხოვნის შემდეგ „მოთხოვნა გაგზავნილია" რომ დაიხატოს */
  headKey: QueryKey
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { enqueueShare } = useQueue()

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [statusMode, setStatusMode] = useState<ShareStatusMode>('default')
  const [adding, setAdding] = useState(false)

  const titleOf = (i: Pick<SharePlanItem, 'title_ka' | 'title_en' | 'year' | 'id'>) => {
    const title = (lang === 'ka' ? i.title_ka : i.title_en) || i.title_en || i.title_ka || `#${i.id}`
    return i.year ? `${title} (${i.year})` : title
  }

  const toggle = (id: number) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /** „ყველა ახლის მონიშვნა" / „მონიშვნის მოხსნა" — ჩატვირთული ახლებიდან */
  const toggleAll = (freshIds: number[]) =>
    setSelected((cur) => (cur.size === freshIds.length ? new Set() : new Set(freshIds)))

  const clear = () => setSelected(new Set())

  /** ჯერ გეგმა (რომელი უკვე გაქვს), მერე რიგი; `ids`-ის გარეშე — მთელი სექცია */
  const add = async (ids?: number[]) => {
    if (!domain) return
    setAdding(true)

    try {
      const result = await plan(domain, ids)
      const queue = result.items.filter((i) => i.state !== 'have')

      if (queue.length) {
        enqueueShare(
          source,
          domain,
          queue.map((i) => ({ id: i.id, title: titleOf(i) })),
          statusMode,
        )
      }

      toast({
        title: result.counts.new > 0 ? t('share.page.queued', { count: result.counts.new }) : t('share.page.nothingNew'),
        description:
          [
            result.counts.have > 0 && t('share.summary.have', { count: result.counts.have }),
            result.counts.trash > 0 && t('share.summary.trash', { count: result.counts.trash }),
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
        variant: result.counts.new > 0 ? 'success' : 'info',
      })
      clear()
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    } finally {
      setAdding(false)
    }
  }

  const askModule = useMutation({
    mutationFn: (d: ShareDomainKey) => requestModule(shareMeta(d).module),
    onSuccess: () => {
      toast({ title: t('share.page.requested'), variant: 'success' })
      qc.invalidateQueries({ queryKey: headKey })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return {
    selected,
    toggle,
    toggleAll,
    clear,
    statusMode,
    setStatusMode,
    adding,
    add,
    requestModule: () => domain && askModule.mutate(domain),
    requesting: askModule.isPending,
  }
}
