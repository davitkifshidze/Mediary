import { readModuleSetting, useModuleSetting } from '@/lib/moduleSetting'

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
  return readModuleSetting(settings, setting, RECORD_LAYOUTS, fallback)
}

/** შენახვა და აღდგენა — `useModuleSetting` (ერთი მექანიზმი მოდულის ყველა არჩევანზე) */
export function useRecordLayout(
  moduleKey: string,
  fallback: RecordLayout,
  setting: string = VIEW_SETTING,
): readonly [RecordLayout, (next: RecordLayout) => void] {
  return useModuleSetting(moduleKey, setting, RECORD_LAYOUTS, fallback)
}
