import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ka from './ka.json'
import { safeGet } from '@/lib/storage'

/* ============================================================
   **ერთ ჩატვირთვაზე ერთი ლოკალი (Tasks PERF-08).**

   ⚠️ ადრე ორივე JSON **სტატიკურად** იმპორტირდებოდა (`ka` 232 kB + `en`
   128 kB), `main.tsx` კი `./i18n`-ს პირდაპირ ტვირთავს — ე.ი. ქართულენოვანი
   მომხმარებელი მთელ ინგლისურ ლექსიკონს იწერდა და პირიქით. ეს იმავე კლასის
   რეგრესიაა, რასაც `@/pages/` იმპორტის დამცავი grep იჭერს, უბრალოდ
   დაუფარავი.

   ⚠️ **`ka` რჩება სტატიკური და `en` ხდება დინამიური** — და არა პირიქით ან
   ორივე: სტატიკური იმპორტი build-time-ზე იჭრება, `lang` კი localStorage-შია,
   ე.ი. „მხოლოდ შენახული ლოკალი სტატიკურად" შეუძლებელია. `ka` ნაგულისხმევია
   (`localStorage`-ის გარეშეც) და რეპოს სამუშაო ენაა, ამიტომ **სწორედ ის
   ჯდება საწყის chunk-ში**; ინგლისურენოვანი კი მის ბუნდლს არ ტვირთავს.

   ⚠️ **ჩატვირთვა i18next-ის საკუთარი `backend`-ია და არა ხელით
   `addResourceBundle`.** მიზეზი ორია: (1) `i18n.changeLanguage('en')`
   თვითონვე იწვევს `read()`-ს, ე.ი. `LanguageDropdown`-ს და
   `errors.test.ts`-ს **არაფერი შეეცვალა** — ხელით ჩატვირთვა ყველა
   გამომძახებელს დაავალდებულებდა „ჯერ ჩატვირთე, მერე გადართე"-ს და ერთი
   მათგანი დაგვავიწყდებოდა; (2) `changeLanguage` ენას **ჩატვირთვის შემდეგ**
   ცვლის, ე.ი. გადართვისას ეკრანზე ძველი ტექსტია და არა გასაღებები.

   ⚠️ **`fallbackLng: false` აუცილებელია და არა გემოვნება.** i18next fallback
   ენას `toResolveHierarchy()`-ში ჩადებს და backend-ით **მასაც ჩამოტვირთავს**
   — ე.ი. `fallbackLng: 'en'` ზუსტად იმას დააბრუნებდა, რასაც ეს ცვლილება
   აშორებს. ფასი: `ka`-ში გამორჩენილი გასაღები აღარ ჩამოვარდება ინგლისურზე,
   არამედ თვითონ გასაღები დაიხატება. დღეს ეს განსხვავება **არ ჩანს** —
   i18n-ის აუდიტი დრიფტს კრძალავს და ორივე ლოკალს ზუსტად 2682 გასაღები აქვს
   (გაზომილი).

   ⚠️ **`react: { useSuspense: false }`**: backend-ის არსებობისას
   `hasLoadedNamespace()` ჩატვირთვის მიმდინარეობისას `false`-ია და
   `useTranslation` **დაასუსპენდებდა**; `<Suspense>` კი მხოლოდ `<main>`-ის
   შიგნითაა (route-ების chunk-ებისთვის), ე.ი. გარსი უსაზღვრო suspend-ზე
   ჩავარდებოდა. მაუნთამდე ლოკალი ისედაც ჩატვირთულია (`i18nReady`), ამიტომ
   ეს მხოლოდ გადართვის წამის დაცვაა.
   ============================================================ */

/**
 * დინამიური ლოკალები — `ka` ბუნდლშია, დანარჩენი აქ.
 * ახალი ენა = ერთი ხაზი აქ (+ `LanguageDropdown`-ის `SelectItem`).
 */
const BUNDLES: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import('./en.json'),
}

/**
 * ⚠️ **ნორმალიზება განზრახაა**: localStorage-ში ხელით ჩაწერილი უცნობი ენა
 * (ან მომავალი ვერსიის მნიშვნელობა) `fallbackLng`-ის გარეშე ცარიელ
 * ინტერფეისს ნიშნავდა. `LanguageDropdown` ზუსტად იმავე წესით ხატავს არჩევანს.
 */
export const savedLanguage = safeGet('lang') === 'en' ? 'en' : 'ka'

/** ლოკალის ფაილის მკითხველი — i18next-ის `backend` მოდულის მინიმალური ფორმა */
const backend = {
  type: 'backend' as const,
  init: () => {},
  read: (
    language: string,
    _namespace: string,
    callback: (error: unknown, data?: Record<string, unknown>) => void,
  ) => {
    const load = BUNDLES[language]

    // უცნობი ენა შეცდომა არაა — ცარიელი ბუნდლი არაფერს ცვლის (`{...pack}`)
    if (!load) {
      callback(null, {})

      return
    }

    load()
      .then((module) => callback(null, module.default))
      .catch((error) => callback(error))
  },
}

/**
 * **ინიციალიზაციის promise — `main.tsx` მაუნთამდე ელოდება.**
 *
 * ⚠️ ინგლისურენოვანისთვის ეს ერთი დამატებითი (პატარა) fetch-ია მაუნთამდე;
 * სამაგიეროდ ეკრანზე გასაღებების „აციმციმება" არ ხდება. ქართულისთვის
 * ლოდინი არაფერს უდრის — ბუნდლი უკვე ბუნდლშია.
 */
/**
 * **დოკუმენტის ენა ინტერფეისის ენას მიჰყვება (Tasks DEBT-25).**
 *
 * `index.html`-ში `lang="ka"` სტატიკურად ეწერა, ე.ი. ინგლისურ ინტერფეისზეც
 * `ka` რჩებოდა — ეკრანის მკითხველი ინგლისურ ტექსტს ქართული ხმით კითხულობდა,
 * ბრაუზერი კი „თარგმნა"-ს სთავაზობდა იქ, სადაც საჭირო არაა.
 *
 * ⚠️ **აქ და არა კომპონენტში**: ენის ცვლილების ერთადერთი წყარო i18next-ია
 * (`LanguageDropdown` მას `changeLanguage()`-ით ცვლის), ე.ი. listener-ი
 * სწორედ აქ ფარავს **ყველა** გზას — მათ შორის მომავალ გამომძახებელს.
 *
 * ⚠️ `typeof document` შემოწმება ტესტებისთვის არაა (jsdom-ში ის არსებობს) —
 * ის ამ მოდულს ნებისმიერ DOM-ის გარეშე გარემოში უსაფრთხოს ხდის.
 */
function syncDocumentLanguage(language: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language
  }
}

i18n.on('languageChanged', syncDocumentLanguage)

export const i18nReady = i18n
  .use(backend)
  .use(initReactI18next)
  .init({
    resources: {
      ka: { translation: ka },
    },
    // ბუნდლში მხოლოდ ერთი ლოკალია — დანარჩენი backend-ის საქმეა
    partialBundledLanguages: true,
    lng: savedLanguage,
    fallbackLng: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })

// ⚠️ ინიციალიზაციაზე `languageChanged` გარანტირებული არაა — საწყისი მნიშვნელობა ცხადად იწერება
syncDocumentLanguage(savedLanguage)

export default i18n
