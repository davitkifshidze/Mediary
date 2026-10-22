import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { updateModuleSettings, type ModuleInfo } from '@/api/account'
import { useModules } from '@/lib/modules'

/* ============================================================
   **მუქი / ღია სამსახური** — „მუქად 112, ღიად კლინიკა".

   ღია სამსახურის ჩიპები და სტრიქონები ბაცად (45%) ჩანს, ფერი უცვლელია; ეს
   ფილტრი არ არის — მორიგეობები რჩება და ჯამშიც ითვლება. არჩევანი მოდულზე
   ინახება (`module_user.settings.dim` — ღია სამსახურების id-ები), სხვა
   მოწყობილობაზეც იგივეა (`usePageSize`-ის წესი: ჯერ ეკრანი, მერე სერვერი).
   ============================================================ */

const KEY = 'dim'

export function useDutyDim(): readonly [ReadonlySet<number>, (workplaceId: number) => void] {
  const { all } = useModules()
  const qc = useQueryClient()
  const saved = all.find((m) => m.key === 'duty')?.user_settings?.[KEY]
  const [local, setLocal] = useState<number[] | null>(null)

  const list = useMemo(
    () => local ?? (Array.isArray(saved) ? saved.filter((x): x is number => Number.isInteger(x)) : []),
    [local, saved],
  )

  const toggle = useCallback(
    (workplaceId: number) => {
      const next = list.includes(workplaceId) ? list.filter((x) => x !== workplaceId) : [...list, workplaceId]
      setLocal(next)
      qc.setQueryData<ModuleInfo[]>(['modules'], (modules) =>
        modules?.map((m) => (m.key === 'duty' ? { ...m, user_settings: { ...m.user_settings, [KEY]: next } } : m)),
      )
      void updateModuleSettings('duty', { [KEY]: next }).catch(() => {
        // შენახვის ჩავარდნა ხედს არ აჩერებს — შემდეგ ჯერზე შენახული იქნება
      })
    },
    [list, qc],
  )

  return [useMemo(() => new Set(list), [list]), toggle] as const
}
