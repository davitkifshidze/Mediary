import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { updateModuleSettings, type ModuleInfo } from '@/api/account'
import { useModules } from '@/lib/modules'

/* ============================================================
   **ერთი არჩევანი მოდულზე** — `module_user.settings`-ის ერთი გასაღები
   ფიქსირებული მნიშვნელობებით (სიის ხედი, ჟანრების რეჟიმი).

   ⚠️ **არჩევანი მოდულზე ინახება** და არა ბრაუზერში — ყველა მოწყობილობაზე
   ერთნაირია. შენახვა **ჩუმია**: ჯერ `['modules']`-ის ქეში (შემდეგი გახსნაც
   უმალ ხედავს), მერე სერვერი; ჩავარდნა ეკრანს არ აჩერებს. სერვერი ბლობს
   **ერწყმის** (`ModuleSettings::merge`), ე.ი. იმავე მოდულის სხვა გასაღებებს
   არ შლის.

   ⚠️ ლოკალური მდგომარეობაც აქვს (მოდულისა და გასაღების წყვილით): ქეში
   მოდულების სიაა, და გადართვა უმალ უნდა ჩანდეს მაშინაც, როცა სია ჯერ არ
   ჩატვირთულა.
   ============================================================ */

/** ⚠️ ბლობი ნებისმიერი იყოს — უცნობი/დაზიანებული მნიშვნელობა ნაგულისხმევს ნიშნავს */
export function readModuleSetting<T extends string>(
  settings: Record<string, unknown> | undefined,
  setting: string,
  values: readonly T[],
  fallback: T,
): T {
  const raw = settings?.[setting]
  return typeof raw === 'string' && (values as readonly string[]).includes(raw) ? (raw as T) : fallback
}

export function useModuleSetting<T extends string>(
  moduleKey: string,
  setting: string,
  values: readonly T[],
  fallback: T,
): readonly [T, (next: T) => void] {
  const { all } = useModules()
  const qc = useQueryClient()
  const scope = `${moduleKey}:${setting}`
  const [local, setLocal] = useState<{ scope: string; value: T } | null>(null)
  const saved = readModuleSetting(all.find((m) => m.key === moduleKey)?.user_settings, setting, values, fallback)

  const change = useCallback(
    (next: T) => {
      setLocal({ scope, value: next })
      qc.setQueryData<ModuleInfo[]>(['modules'], (list) =>
        list?.map((m) => (m.key === moduleKey ? { ...m, user_settings: { ...m.user_settings, [setting]: next } } : m)),
      )
      void updateModuleSettings(moduleKey, { [setting]: next }).catch(() => {
        // მეხსიერების დაკარგვა ეკრანს არ აჩერებს — შემდეგ ჯერზე შენახული/ნაგულისხმევი იქნება
      })
    },
    [qc, moduleKey, setting, scope],
  )

  // ⚠️ სხვა მოდულზე გადასვლისას (პირადი მოდულები ერთ გვერდს იზიარებენ) ლოკალური აღარ მოქმედებს
  return [local?.scope === scope ? local.value : saved, change] as const
}
