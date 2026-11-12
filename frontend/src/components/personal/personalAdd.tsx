import type { AddDialog } from '@/components/ui/inline-add'
import { PersonDialog } from './PersonDialog'
import { PersonalAlbumDialog } from './PersonalAlbumDialog'

/* ============================================================
   **პიროვნებისა და ალბომის იქვე დამატება** — ატვირთვისა და გადატანის
   ფანჯრების „+".

   ⚠️ იგივე ორი ფანჯარაა, რასაც „პიროვნებების" და „ალბომების" ჭრილები ხსნის;
   აქ მხოლოდ ისაა დამატებული, რომ შენახული ჩანაწერი მაშინვე არჩეულია.
   ============================================================ */

/** ახალი პიროვნება */
export const addPerson: AddDialog = (close, pick) => (
  <PersonDialog person={null} onClose={close} onSaved={(saved) => pick(String(saved.id))} />
)

/** ახალი ალბომი — უკვე არჩეული პიროვნებით, თუ ასეთი არის; `screenshot` — სქრინშოტების სივრცეში */
export function addAlbum(personId: number | null, screenshot = false): AddDialog {
  return (close, pick) => (
    <PersonalAlbumDialog
      album={null}
      personId={personId ?? undefined}
      screenshot={screenshot}
      onClose={close}
      onSaved={(saved) => pick(String(saved.id))}
    />
  )
}
