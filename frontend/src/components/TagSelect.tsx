import CreatableSelect from 'react-select/creatable'
import { useTranslation } from 'react-i18next'
import { reactSelectPortal, reactSelectStyles, type Option } from '@/lib/selectStyles'
import { addTag, dedupeTags, tagKey } from '@/lib/tags'
import { useAlert } from '@/components/ui/feedback'

const multiStyles = reactSelectStyles<true>()

/**
 * ტეგების multi-select (L8) — იგივე ბიბლიოთეკა და სტილები, რაც ჟანრებზე
 * (`GenreSelect`). არსებული ტეგი ჩამონათვალიდან აირჩევა, ახალი — აკრეფით
 * იქმნება; ჩიპი „x"-ით იხსნება. backend-ის მხარე უცვლელია (`videos.tags` json).
 *
 * ⚠️ **დუბლიკატი აქ იჭრება და აქ ხმაურდება** (Tasks §2.6 → §13). ყველა
 * მოდულის ტეგი (და ბორდგეიმის „მექანიკები") ამ ერთ კომპონენტში შედის, ე.ი.
 * წესი ერთხელ იწერება. „Rock" და „rock" ერთი ტეგია — react-select თვითონ
 * მხოლოდ **ზუსტ** დუბლს იცავს.
 *
 * ⚠️ **იგივეს დამატებაზე პოპაპია და არა ტოსტი** (Tasks §13.2, შენი სიტყვები:
 * „ამოვარდეს სვალის მსგავსი პოპაპი და გითხრას, რომ მსგავსი უკვე არსებობს,
 * და წაშალოს ბოლოს დამატებული"). Enter-ზე `isValidNewOption` ყოველთვის
 * „კი"-ს ამბობს, რომ დუბლმაც `onCreateOption`-მდე მოაღწიოს — სწორედ იქ
 * ჩნდება გაფრთხილება და **ბოლოს აკრეფილი იკარგება, პირველი რჩება**. მენიუდან
 * რეგისტრით განსხვავებული ვარიანტის არჩევაც იგივე გზას გადის (`apply`).
 * submit-ზე `dedupeTags` ყველგან **უხმოდ** რჩება გარანტიად (§13.3) — აქ
 * გავლილი სიისთვის მას უკვე აღარაფერი რჩება მოსაჭრელი.
 */
export function TagSelect({
  options: available,
  value,
  onChange,
  placeholder,
  inputId,
}: {
  /** ბიბლიოთეკაში უკვე არსებული ტეგები — შემოთავაზების სია */
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  inputId?: string
}) {
  const { t } = useTranslation()
  const alert = useAlert()

  const warnDuplicate = (tag: string) =>
    void alert({ title: t('tags.duplicateTitle'), description: t('tags.duplicateAlert', { tag }), variant: 'warning' })

  /** არჩევა/მოხსნა მენიუდან და ჩიპებიდან — რეგისტრით განსხვავებული ვარიანტი იჭრება და გაფრთხილება ჩნდება */
  const apply = (next: string[]) => {
    const { tags, removed } = dedupeTags(next)
    if (removed > 0) {
      const extra = next.find((raw, i) => next.findIndex((x) => tagKey(x) === tagKey(raw)) !== i)
      warnDuplicate(extra ?? next[next.length - 1])
    }
    onChange(tags)
  }

  /** აკრეფილი ტეგი Enter-ზე — დუბლი არ ემატება (გაფრთხილება), ბიბლიოთეკაში ნაცნობი ფორმა ინარჩუნებს რეგისტრს */
  const create = (input: string) => {
    const result = addTag(value, input, available)
    if (result.duplicate) {
      warnDuplicate(result.duplicate)
      return
    }
    if (result.added) onChange(result.tags)
  }

  // არჩეული ტეგი შესაძლოა სიაში არ იყოს (ახლად შექმნილი) — ისიც ვარიანტად ვამატებთ
  const options: Option[] = [...new Set([...available, ...value])]
    .sort((a, b) => a.localeCompare(b))
    .map((tag) => ({ value: tag, label: tag }))
  const selected = value.map((tag) => ({ value: tag, label: tag }))

  return (
    /* ⚠️ Tasks §1.3 — Enter **ფორმას არ უნდა გადაეცეს**.
       ტეგის აკრეფის შემდეგ Enter-ს react-select მაშინ იჭერს, როცა მენიუ
       ღიაა და ვარიანტი ფოკუსშია; დანარჩენ შემთხვევაში (ცარიელი ველი,
       დახურული მენიუ) ბრაუზერის „implicit submit" ფორმას აგზავნიდა და
       გამოდიოდა „The url field is required".

       preventDefault **გარე div-ზეა და არა `onKeyDown` prop-ში**: prop-ს
       react-select თავის ლოგიკამდე იძახებს და `defaultPrevented`-ზე
       საერთოდ ჩერდება — ე.ი. ტეგი აღარ დაემატებოდა. bubble-ის ბოლოს კი
       react-select-მა უკვე გააკეთა თავისი, ჩვენ მხოლოდ სუბმიტს ვკლავთ. */
    <div onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}>
      <CreatableSelect<Option, true>
        isMulti
        inputId={inputId}
        options={options}
        value={selected}
        onChange={(vals) => apply(vals.map((v) => v.value))}
        onCreateOption={create}
        isValidNewOption={(input) => input.trim().length > 0}
        placeholder={placeholder ?? t('videos.tagsPlaceholder')}
        formatCreateLabel={(input) => t('videos.tagCreate', { tag: input })}
        noOptionsMessage={() => t('videos.tagTypeToCreate')}
        styles={multiStyles}
        classNamePrefix="rs"
        menuPlacement="auto"
        {...reactSelectPortal}
      />
    </div>
  )
}
