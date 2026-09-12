import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchModuleFields, type ModuleField } from '@/api/account'

/* ============================================================
   ველების კონსტრუქტორი — ფორმის მხარე (Tasks §6, ფაზა 2).

   ⚠️ **ლეიბლის ერთადერთი გამომთვლელი.** backend გადაწერილ ტექსტს `null`-ად
   აბრუნებს, სანამ user არ შეცვლის — ნაგულისხმევი ტექსტი ლოკალიზაციაშია
   (`fields.name.<module>.<key>`), ე.ი. ორ ენაზე და თარგმანთან ერთად. თუ ეს
   არჩევანი ორ ადგილას გაკეთდებოდა, ერთი მათგანი ოდესმე ინგლისურს აჩვენებდა.

   ⚠️ **`required` ფორმის დისციპლინაა და არა სქემის შეზღუდვა.** ველი
   კატალოგში სწორედ იმიტომაა, რომ ბაზაზე არჩევითია — backend მას არ
   ამოწმებს. ე.ი. `isMissing()` ფორმის შემოწმებაა და არა უსაფრთხოების.
   ============================================================ */

export interface FieldsApi {
  /** ჩანს თუ არა ველი (უცნობი key — **ჩანს**: კატალოგში ჯერ არ არის) */
  shows: (key: string) => boolean
  required: (key: string) => boolean
  /** ჩაკეტილი ველი — ფორმამ არც უნდა შეეცადოს მისი დამალვა (§6.5) */
  locked: (key: string) => boolean
  label: (key: string) => string
  /**
   * ველის ახსნა ჰოვერისთვის (Tasks §2.3) — `fields.desc.<module>.<key>`.
   * `undefined`, თუ ლოკალიზაციაში არ არის: აიქონი მაშინ არ ჩნდება
   * (ცარიელი tooltip უარესია, ვიდრე აიქონის არქონა).
   */
  hint: (key: string) => string | undefined
  placeholder: (key: string) => string | undefined
  /** სავალდებულო ველი ცარიელია — ფორმამ შენახვა უნდა შეაჩეროს */
  isMissing: (key: string, value: unknown) => boolean
  all: ModuleField[]
}

export function useModuleFields(moduleKey: string): FieldsApi {
  const { t, i18n } = useTranslation()
  const { data: fields = [] } = useQuery({
    queryKey: ['module-fields', moduleKey],
    queryFn: () => fetchModuleFields(moduleKey),
  })

  const ka = i18n.language === 'ka'
  const find = (key: string) => fields.find((f) => f.key === key)

  return {
    all: fields,
    /* ⚠️ უცნობი ველი **ჩანს**, არ იმალება: კატალოგი ნელა იზრდება და ჯერ
       ჩაუწერელი ველი ფორმიდან ჩუმად არ უნდა გაქრეს. */
    shows: (key) => find(key)?.enabled ?? true,
    required: (key) => find(key)?.required ?? false,
    locked: (key) => find(key)?.locked ?? false,
    label: (key) => {
      const field = find(key)
      const own = ka ? field?.label_ka : field?.label_en
      return own ?? t(`fields.name.${moduleKey}.${key}`, { defaultValue: key })
    },
    hint: (key) => {
      const text = t(`fields.desc.${moduleKey}.${key}`, { defaultValue: '' })
      return text || undefined
    },
    placeholder: (key) => {
      const field = find(key)
      const own = ka ? field?.placeholder_ka : field?.placeholder_en
      // ნაგულისხმევი placeholder არაა სავალდებულო — `undefined` ნიშნავს „არ იყოს"
      return own ?? undefined
    },
    isMissing: (key, value) => {
      if (!find(key)?.required) return false
      if (Array.isArray(value)) return value.length === 0
      if (value == null) return true
      return String(value).trim() === ''
    },
  }
}
