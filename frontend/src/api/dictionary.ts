/* ============================================================
   **ლექსიკონის ერთეულის წაშლა — რვავე endpoint-ის ერთი ფორმა.**

   ვიდეოს ტიპი · ხუთი ჟანრი · ორი კატეგორია · სტატუსი — ყველა ერთსა და
   იმავე სამ არჩევანს იღებს (backend: `App\Support\DictionaryRecords`):
   გადატანა · ცარიელად დატოვება · **ჩანაწერების წაშლაც**.

   ⚠️ **`move_to` და `delete_records` ერთად არასდროს იგზავნება** — backend
   ამას 422-ით აგდებს, ე.ი. ტანი ერთ ადგილას იწყობა და არა რვა API ფაილში.
   ============================================================ */

export interface DictionaryRemoval {
  /** სხვა ერთეულზე გადატანა */
  moveTo?: number | null
  /** ⚠️ ჩანაწერები რჩება, უბრალოდ ლექსიკონის გარეშე — **ცხადი არჩევანი** */
  clearRecords?: boolean
  /** ⚠️ ჩანაწერებიც სამუდამოდ იშლება (ფაილებით, მოდელის გავლით) */
  deleteRecords?: boolean
  /**
   * კურსში მცხოვრები ვიდეოები სად გადავიდეს — ისინი ლექსიკონის წაშლით არასდროს
   * იშლება. გადატანისას `moveTo`-ს მიჰყვება; დანარჩენ ორ რეჟიმში სავალდებულოა
   * (422 `lesson_target_required`).
   */
  lessonsTo?: number | null
}

export interface DictionaryRemoved {
  moved: number
  deleted: number
  /** რამდენი კურსის ვიდეო გადავიდა სხვა ერთეულზე */
  lessons: number
}

/**
 * ⚠️ **სამივე განზრახვა ცხადად იგზავნება**. აქამდე
 * „ცარიელად დატოვება" `move_to: null`-ით მიდიოდა, ე.ი. სერვერზე ის
 * **დავიწყებული ველისგან არ განსხვავდებოდა** — ახლა `clear_records`-ია და
 * განზრახვის გარეშე მოთხოვნა 422 `move_target_required`-ია.
 */
export function removalBody(removal: DictionaryRemoval = {}) {
  const lessons = removal.lessonsTo != null ? { lessons_to: removal.lessonsTo } : {}

  if (removal.deleteRecords) return { delete_records: true, ...lessons }
  if (removal.clearRecords || removal.moveTo == null) return { clear_records: true, ...lessons }

  return { move_to: removal.moveTo }
}

export function readRemoved(data: { moved?: number; deleted?: number; lessons?: number }): DictionaryRemoved {
  return { moved: data.moved ?? 0, deleted: data.deleted ?? 0, lessons: data.lessons ?? 0 }
}
