/*
  Service Worker — შეხსენებების ბრაუზერული შეტყობინებები (Tasks §13.3).

  რატომ სჭირდება საერთოდ SW, თუ `new Notification()` გვერდიდანაც მუშაობს:
  ჩაკეცილ/ფონურ ტაბზე ზოგი ბრაუზერი (და ყველა მობილური) მხოლოდ
  `ServiceWorkerRegistration.showNotification()`-ს იღებს. აქ მისი ერთადერთი
  საქმეა შეტყობინების ჩვენება და დაკლიკებაზე სწორ გვერდზე გადაყვანა —
  push-ის გამოწერა (VAPID/სერვერის კლავიშები) განზრახ არ არის: მიწოდება
  polling-ით მიდის, ე.ი. გარე სერვისზე დამოკიდებულება არ ჩნდება.

  ⚠️ როცა ბრაუზერი **სრულად დახურულია**, ეს ფაილიც ვერაფერს იზამს —
  ამ შემთხვევისთვის ტელეგრამი/ელფოსტაა (backend-ის `notes:remind`).
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
