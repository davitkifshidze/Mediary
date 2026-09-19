/*
  Service Worker — შეხსენებების ბრაუზერული შეტყობინებები (Tasks §13.3).

  რატომ სჭირდება საერთოდ SW, თუ `new Notification()` გვერდიდანაც მუშაობს:
  ჩაკეცილ/ფონურ ტაბზე ზოგი ბრაუზერი (და ყველა მობილური) მხოლოდ
  `ServiceWorkerRegistration.showNotification()`-ს იღებს. აქ მისი ერთადერთი
  საქმეა შეტყობინების ჩვენება და დაკლიკებაზე სწორ გვერდზე გადაყვანა —
  push-ის გამოწერა (VAPID/სერვერის გასაღებები) განზრახ არ არის: მიწოდება
  polling-ით მიდის, ე.ი. გარე სერვისზე დამოკიდებულება არ ჩნდება.

  ⚠️ როცა ბრაუზერი **სრულად დახურულია**, ეს ფაილიც ვერაფერს იზამს — მაშინ
  ტელეგრამი რჩება (backend-ის `notes:remind`), ხოლო გაშვებული შეხსენება
  `note_notifications`-ში იწერება და გახსნისას ზარის ჟურნალში ჩანს.

  ⚠️ **ელფოსტის არხი აღარ არსებობს** (§8.2, Tasks DEBT-20): SMTP აქ არ დგას,
  ე.ი. ჩუმად მიღებული `email` მომხმარებელს წერილის დაპირებას აძლევდა —
  ახლა ის **422-ია**. ეს კომენტარი მას ერთ წელს კიდევ ასახელებდა.
*/

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = (event.notification.data && event.notification.data.url) || '/notes'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // უკვე გახსნილი ტაბი ვამჯობინოთ ახალს
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
