import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { updateModuleSettings, type ModuleInfo } from '@/api/account'
import { useModules } from '@/lib/modules'

/* ============================================================
   **სიის ხედი — ბარათები · ბადე · სტრიქონები**.

   ⚠️ **არჩევანი მოდულზე ინახება** (`module_user.settings.view`) და არა
   ბრაუზერში — ყველა მოწყობილობაზე ერთნაირია. შენახვა **ჩუმია**, იმავე
   `pick`-ის წესით: ჯერ `['modules']`-ის ქეში (შემდეგი გახსნაც უმალ ხედავს),
   მერე სერვერი; ჩავარდნა ხედს არ აჩერებს. სერვერი ბლობს **ერწყმის**
   (`ModuleSettings::merge`), ე.ი. იმავე მოდულის სხვა ფენებს (`pick`, `fields`,
   სექციები) არ შლის.

   ⚠️ **ნაგულისხმევი ახლანდელი ხედია** — სანამ არ გადართავ, არაფერი იცვლება:
   ვიდეო და ფილმი/სერიალი/ანიმე — ბარათები, დანარჩენი — სტრიქონები.

   ⚠️ ლოკალური მდგომარეობაც აქვს (მოდულის გასაღებით): ქეში მოდულების სიაა, და
   გადართვა უმალ უნდა ჩანდეს მაშინაც, როცა სია ჯერ არ ჩატვირთულა.
   ============================================================ */

const RECORD_LAYOUTS = ['cards', 'grid', 'rows'] as const
export type RecordLayout = (typeof RECORD_LAYOUTS)[number]

/** `module_user.settings`-ის გასაღები; ფლეილისტებს სიმღერის მოდულში თავისი აქვს */
const VIEW_SETTING = 'view'

/** ⚠️ ბლობი ნებისმიერი იყოს — უცნობი/დაზიანებული მნიშვნელობა ნაგულისხმევს ნიშნავს */
export function readLayout(
  settings: Record<string, unknown> | undefined,
  setting: string,
  fallback: RecordLayout,
): RecordLayout {
  const raw = settings?.[setting]
  return typeof raw === 'string' && (RECORD_LAYOUTS as readonly string[]).includes(raw) ? (raw as RecordLayout) : fallback
}

export function useRecordLayout(
  moduleKey: string,
  fallback: RecordLayout,
  setting: string = VIEW_SETTING,
): readonly [RecordLayout, (next: RecordLayout) => void] {
  const { all } = useModules()
  const qc = useQueryClient()
  const scope = `${moduleKey}:${setting}`
  const [local, setLocal] = useState<{ scope: string; layout: RecordLayout } | null>(null)
  const saved = readLayout(all.find((m) => m.key === moduleKey)?.user_settings, setting, fallback)

  const change = useCallback(
    (next: RecordLayout) => {
      setLocal({ scope, layout: next })
      qc.setQueryData<ModuleInfo[]>(['modules'], (list) =>
        list?.map((m) => (m.key === moduleKey ? { ...m, user_settings: { ...m.user_settings, [setting]: next } } : m)),
      )
      void updateModuleSettings(moduleKey, { [setting]: next }).catch(() => {
        // მეხსიერების დაკარგვა ხედს არ აჩერებს — შემდეგ ჯერზე შენახული/ნაგულისხმევი იქნება
      })
    },
    [qc, moduleKey, setting, scope],
  )

  // ⚠️ სხვა მოდულზე გადასვლისას (პირადი მოდულები ერთ გვერდს იზიარებენ) ლოკალური აღარ მოქმედებს
  return [local?.scope === scope ? local.layout : saved, change] as const
}
