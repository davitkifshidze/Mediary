/* ============================================================
   **ლექსიკონის ერთეულის წაშლა — რვავე endpoint-ის ერთი ფორმა (ეტაპი 8).**

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
}

export interface DictionaryRemoved {
  moved: number
  deleted: number
}

/**
 * ⚠️ **სამივე განზრახვა ცხადად იგზავნება** (Tasks GAP-09). აქამდე
 * „ცარიელად დატოვება" `move_to: null`-ით მიდიოდა, ე.ი. სერვერზე ის
 * **დავიწყებული ველისგან არ განსხვავდებოდა** — ახლა `clear_records`-ია და
 * განზრახვის გარეშე მოთხოვნა 422 `move_target_required`-ია.
 */
export function removalBody(removal: DictionaryRemoval = {}) {
  if (removal.deleteRecords) return { delete_records: true }
  if (removal.clearRecords || removal.moveTo == null) return { clear_records: true }

  return { move_to: removal.moveTo }
}

export function readRemoved(data: { moved?: number; deleted?: number }): DictionaryRemoved {
  return { moved: data.moved ?? 0, deleted: data.deleted ?? 0 }
}
