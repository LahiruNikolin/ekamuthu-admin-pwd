// Cache only the public offline page. Never persist API responses, tokens, or admin data.
const CACHE = 'ekamuthu-admin-pwa-__BUILD_VERSION__';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add('/offline.html')).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('ekamuthu-admin-pwa-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match('/offline.html'))));
});

self.addEventListener('push', event => {
  let message;
  try { message = event.data?.json(); } catch { return; }
  if (!message) return;
  event.waitUntil(self.registration.showNotification(message.title || 'Ekamuthu Admin', {
    body: message.body || 'A venue update is available.', icon: '/icons/notification-icon.png?v=__BUILD_VERSION__', badge: '/icons/notification-badge.png?v=__BUILD_VERSION__',
    tag: message.notification_id, data: { ...message.data, notification_id: message.notification_id },
  }).then(async () => {
    for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'VENUE_UPDATED' });
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  // Route through the authenticated feed. The application reads the notification by its ID
  // and derives navigation from server data, never a push-supplied external URL.
  const id = event.notification.data?.notification_id || '';
  const url = new URL('/notifications?open=' + encodeURIComponent(id), self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const client = clients.find(c => new URL(c.url).origin === self.location.origin);
    if (client) { await client.navigate(url); return client.focus(); }
    return self.clients.openWindow(url);
  }));
});
