import { beforeAll, describe, expect, it } from 'vitest'
import i18n, { i18nReady, savedLanguage } from '@/i18n'

/* ============================================================
   **ერთ ჩატვირთვაზე ერთი ლოკალი (Tasks PERF-08).**

   ⚠️ ეს ტესტი **ბუნდლის** თვისებას იცავს და არა თარგმანების: ორივე JSON
   სტატიკურად იმპორტირდებოდა, ე.ი. ქართულენოვანი მთელ ინგლისურ ლექსიკონსაც
   იწერდა. ამის დაბრუნება ჩუმია — `tsc`-ც, oxlint-იც და i18n-ის აუდიტიც
   მწვანე დარჩება, bundle კი 104 kB-ით გაიზრდება.

   ⚠️ **ყველაზე ადვილად დასაბრუნებელი გზა `fallbackLng`-ია**: i18next fallback
   ენას `toResolveHierarchy()`-ში ჩადებს და backend-ით მასაც ჩამოტვირთავს,
   ე.ი. `fallbackLng: 'en'` `en`-ს **init-ზევე** მოიყვანდა. სწორედ ამიტომ
   ქვემოთ „`en` ჯერ არ არის" ცხადად მოწმდება.
   ============================================================ */

describe('i18n', () => {
  beforeAll(async () => {
    await i18nReady
  })

  it('ბუნდლში მხოლოდ შენახული ლოკალია', () => {
    // localStorage ტესტში ცარიელია → ნაგულისხმევი ქართულია
    expect(savedLanguage).toBe('ka')
    expect(i18n.hasResourceBundle('ka', 'translation')).toBe(true)
    expect(i18n.t('actions.save')).toBe('შენახვა')

    // ⚠️ ესაა ტასკის მთელი აზრი: მეორე ლოკალი ჯერ არსად არაა
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(false)
  })

  it('ენის გადართვა მეორე ლოკალს **მთლიანად** მოიყვანს', async () => {
    await i18n.changeLanguage('en')

    expect(i18n.t('actions.save')).toBe('Save')

    // ⚠️ ერთი გასაღები არ კმარა — „სრულად ითარგმნება" ნიშნავს, რომ ბუნდლი
    // მთლიანად ჩამოვიდა და არა მისი ნაწილი
    const en = i18n.getResourceBundle('en', 'translation') as Record<string, unknown>
    const ka = i18n.getResourceBundle('ka', 'translation') as Record<string, unknown>
    expect(Object.keys(en)).toEqual(Object.keys(ka))

    await i18n.changeLanguage('ka')
    expect(i18n.t('actions.save')).toBe('შენახვა')
  })

  /**
   * **დოკუმენტის ენა ინტერფეისს მიჰყვება (Tasks DEBT-25).**
   *
   * ⚠️ `index.html`-ში `lang="ka"` სტატიკური იყო, ე.ი. ინგლისურ ინტერფეისზეც
   * `ka` რჩებოდა — ეკრანის მკითხველი, ბრაუზერის თარგმანი და ტირეებად დაშლა
   * ინგლისურ ტექსტს ქართულად ექცეოდნენ.
   */
  it('`<html lang>` ენის გადართვას მიჰყვება', async () => {
    expect(document.documentElement.lang).toBe('ka')

    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')

    await i18n.changeLanguage('ka')
    expect(document.documentElement.lang).toBe('ka')
  })
})
