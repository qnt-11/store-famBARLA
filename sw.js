/**
 * SERVICE WORKER store famBARLA
 * Architecture: Network-First (HTML), Cache-First (CDN), Stale-While-Revalidate (Dynamic)
 */

const APP_VERSION = '2.0';

const CACHE_CORE = 'fambarla-core-v' + APP_VERSION; 
const CACHE_DYNAMIC = 'fambarla-dynamic-v' + APP_VERSION;
const CACHE_CDN = 'fambarla-cdn-v1'; 
const MAX_DYNAMIC_ITEMS = 50; 
let isTrimming = false;

const coreUrls = [
  './',
  './index.html',
  './manifest.json'
];

const cdnDomains = [
  'tailwindcss.com',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'fonts.googleapis.com', 
  'fonts.gstatic.com'
];

async function trimCache(cacheName, maxItems) {
  if (isTrimming) return;
  isTrimming = true;
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      const itemsToDelete = keys.slice(0, keys.length - maxItems);
      await Promise.all(itemsToDelete.map(key => cache.delete(key)));
    }
  } catch (e) {
    console.error('Trim Cache Error:', e);
  } finally {
    isTrimming = false;
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_CORE).then(cache => {
      return Promise.all(coreUrls.map(async url => {
        try {
          const req = new Request(url, { cache: 'reload' });
          const res = await fetch(req);
          if (res && res.ok) {
            await cache.put(req, res);
          }
        } catch (error) {
          console.error('Gagal pre-cache:', url, error);
        }
      }));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => {
        // Hapus cache lama kecuali Core baru, Dynamic baru, dan CDN persisten
        if (key.startsWith('fambarla-') && key !== CACHE_CORE && key !== CACHE_DYNAMIC && key !== CACHE_CDN) {
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim()) 
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Abaikan request API & request Non-GET
  if (req.method !== 'GET' || url.pathname.endsWith('sw.js') || url.hostname === 'script.google.com' || !url.protocol.startsWith('http')) {
    return;
  }

  // STRATEGI 1: Network-First (Inti Aplikasi: HTML & Manifest)
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('index.html') || url.pathname.endsWith('manifest.json')) {
    event.respondWith(
      fetch(req).then(res => {
        if (!res || (res.status !== 200 && res.status !== 0 && res.type !== 'opaqueredirect')) {
          throw new Error('Invalid response');
        }
        const resClone = res.clone();
        caches.open(CACHE_CORE).then(cache => cache.put(req, resClone));
        return res;
      }).catch(async () => {
        const cachedRes = await caches.match(req, { ignoreSearch: true }) || 
                          await caches.match('./', { ignoreSearch: true }) || 
                          await caches.match('./index.html', { ignoreSearch: true });
        
        if (cachedRes) return cachedRes;

        if (url.pathname.endsWith('manifest.json')) {
          return new Response('{"name":"store famBARLA","short_name":"famBARLA","display":"standalone","start_url":"./"}', { 
            headers: { 'Content-Type': 'application/json' } 
          });
        }
        
        return new Response('Aplikasi sedang offline. Tidak ada data di cache.', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } });
      })
    );
    return;
  }

  // STRATEGI 2: Cache-First (File CDN & Font Abadi)
  if (cdnDomains.some(domain => url.hostname.includes(domain))) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(cachedRes => {
        if (cachedRes) return cachedRes; 
        
        return fetch(req).then(res => {
          if (!res || (res.status !== 200 && res.status !== 0)) return res;
          
          const resClone = res.clone();
          caches.open(CACHE_CDN).then(cache => cache.put(req, resClone));
          return res;
        }).catch(() => {
          const headers = new Headers();
          if (url.pathname.endsWith('.css')) headers.set('Content-Type', 'text/css');
          else if (url.pathname.endsWith('.js')) headers.set('Content-Type', 'application/javascript');
          else headers.set('Content-Type', 'text/plain');
          return new Response('', { status: 503, statusText: 'Offline', headers });
        }); 
      })
    );
    return;
  }

  // STRATEGI 3: Stale-While-Revalidate (File Statis Dinamis Latar Belakang)
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cachedRes => {
      const fetchPromise = fetch(req).then(res => {
        // PERBAIKAN: Hanya cache file status 200 untuk mencegah kebocoran memori Opaque
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_DYNAMIC).then(cache => {
            cache.put(req, resClone).then(() => {
              trimCache(CACHE_DYNAMIC, MAX_DYNAMIC_ITEMS);
            });
          });
        }
        return res;
      }).catch(() => {
        const headers = new Headers();
        if (url.pathname.endsWith('.css')) headers.set('Content-Type', 'text/css');
        else if (url.pathname.endsWith('.js')) headers.set('Content-Type', 'application/javascript');
        else if (url.pathname.match(/\.(png|jpg|jpeg|svg|gif)$/i)) {
          headers.set('Content-Type', 'image/svg+xml');
          // PERBAIKAN: Berikan file SVG valid yang transparan (1x1) alih-alih string kosong
          return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>', { status: 503, statusText: 'Offline', headers });
        }
        else headers.set('Content-Type', 'text/plain');
        
        return new Response('', { status: 503, statusText: 'Offline', headers });
      });

      // PERBAIKAN: Pastikan background fetch tidak dibunuh browser jika cache sudah tampil
      if (cachedRes) {
        event.waitUntil(fetchPromise);
        return cachedRes;
      }
      
      return fetchPromise;
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(self.registration.scope);
      }
    })
  );
});
