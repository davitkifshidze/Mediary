/* ============================================================
   **ლექსიკონის ერთეულის წაშლა — რვავე endpoint-ის ერთი ფორმა (ეტაპი 8).**

   ვიდეოს ტიპი · ხუთი ჟანრი · ორი კატეგორია · სტატუსი — ყველა ერთსა და
   იმავე სამ არჩევანს იღებს (backend: `App\Support\DictionaryRecords`):
   გადატანა · ცარიელად დატოვება · **ჩანაწერების წაშლაც**.

   ⚠️ **`move_to` და `delete_records` ერთად არასდროს იგზავნება** — backend
   ამას 422-ით აგდებს, ე.ი. ტანი ერთ ადგილას იწყობა და არა რვა API ფაილში.
   ============================================================ */

export interface DictionaryRemoval {
  /** სხვა ერთეულზე გადატანა; `null`/არაფერი — ჩანაწერები ცარიელად რჩება */
  moveTo?: number | null
  /** ⚠️ ჩანაწერებიც სამუდამოდ იშლება (ფაილებით, მოდელის გავლით) */
  deleteRecords?: boolean
}

export interface DictionaryRemoved {
  moved: number
  deleted: number
}

export function removalBody(removal: DictionaryRemoval = {}) {
  return removal.deleteRecords
    ? { move_to: null, delete_records: true }
    : { move_to: removal.moveTo ?? null }
}

export function readRemoved(data: { moved?: number; deleted?: number }): DictionaryRemoved {
  return { moved: data.moved ?? 0, deleted: data.deleted ?? 0 }
}
