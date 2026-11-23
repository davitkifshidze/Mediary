import { useEffect } from 'react'

/**
 * **არჩეული ფაილის პრევიუს `blob:` მისამართი თავისუფლდება** — როცა იცვლება
 * (სხვა ფაილი აირჩიე) ან ფორმა იხურება. უამისოდ ყოველი არჩეული სურათი
 * ბრაუზერის მეხსიერებაში რჩებოდა გვერდის განახლებამდე.
 *
 * ⚠️ მხოლოდ `blob:` — იგივე მდგომარეობა სერვერის ფოტოს მისამართსაც ინახავს
 * (არსებული პოსტერი), მას გასათავისუფლებელი არაფერი აქვს.
 */
export function useBlobUrlCleanup(url: string | null | undefined): void {
  useEffect(() => {
    if (!url?.startsWith('blob:')) return

    return () => URL.revokeObjectURL(url)
  }, [url])
}
