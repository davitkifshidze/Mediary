import type { CustomClassification, ModuleInfo } from '@/api/account'

/* ============================================================
   **ინტერფეისიდან შექმნილი (პირადი) მოდული — Tasks §37.**

   საბაზისო ცამეტი მოდული კოდია, პირადი კი **ჩანაწერია**: მისი გასაღები
   `c{owner}-{slug}` ფორმისაა (სარკე `App\Support\CustomModules::PATTERN`-ისა),
   მარშრუტი `/c/{key}`, ჩანაწერები კი ერთ ზოგად გვერდზე (`CustomModulePage`).

   ⚠️ **გასაღების ფორმა საკმარისია „პირადია?"-ს პასუხისთვის** — საბაზისო
   გასაღები (`movie`, `board_game`…) ამ ფორმას ვერასდროს დაემთხვევა, ე.ი.
   მოდულის სია არ სჭირდება.
   ============================================================ */

/** პირადი მოდულის გასაღები — `c{ownerId}-{slug}` */
export type CustomModuleKey = `c${number}-${string}`

const KEY = /^c[0-9]+-[a-z0-9-]+$/

export function isCustomModuleKey(value: string | null | undefined): value is CustomModuleKey {
  return typeof value === 'string' && value.length <= 32 && KEY.test(value)
}

/** მოდული ინტერფეისიდანაა შექმნილი? (სერვერის `is_custom` — გასაღების ფორმაც იგივეს ამბობს) */
export function isCustomModule(m: Pick<ModuleInfo, 'key' | 'is_custom'> | null | undefined): boolean {
  return !!m && (m.is_custom === true || isCustomModuleKey(m.key))
}

/**
 * **კლასიფიკაციის ნაგულისხმევი სახელი** (ჟანრი · ტიპი · კატეგორია) —
 * i18n-ის გასაღები. ⚠️ მფლობელის გადარქმევა (Q30) ველების კონსტრუქტორის
 * ლეიბლია (`fields.label('category')`) და მას ეს ნაგულისხმევი ეთმობა.
 */
export function classificationKey(kind: CustomClassification | null | undefined): string {
  return `customModules.classification.${kind ?? 'category'}`
}

/** კლასიფიკატორის (ლექსიკონის) სახელი მრავლობითში — „ჟანრები" · „ტიპები" · „კატეგორიები" */
export function classifierKey(kind: CustomClassification | null | undefined): string {
  return `customModules.classifier.${kind ?? 'category'}`
}
