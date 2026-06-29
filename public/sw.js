// Service Worker for Web Push Notifications
// This file should be placed in /public/sw.js

self.addEventListener('push', function(event) {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'NEPSE Alert', body: event.data.text() };
  }

  const options = {
    body: data.body || 'New alert triggered',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: data.tag || 'nepse-alert',
    renotify: true,
    requireInteraction: false,
    actions: [
      { action: 'view', title: 'View Alert' },
      { action: 'close', title: 'Dismiss' }
    ],
    data: {
      url: data.url || '/dashboard',
      notificationId: data.notificationId
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'NEPSE AXION Alert', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'close') return;

  // Open the dashboard or specific alert page
  const urlToOpen = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If there's already a window open, focus it
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      return clients.openWindow(urlToOpen);
    })
  );
});

self.addEventListener('pushsubscriptionchange', function(event) {
  // Handle subscription expiration
  console.log('Push subscription changed, needs renewal');
});
