/**
 * SERVICE WORKER store famBARLA
 * Architecture: Clean Cache-Key, Strict Install, Network-First, & Aggressive Memory Trimmer.
 */

const APP_VERSION = '1.2'; 

const CACHE_CORE = 'fambarla-core-v' + APP_VERSION; 
const CACHE_DYNAMIC = 'fambarla-dynamic-v' + APP_VERSION;
const MAX_DYNAMIC_ITEMS = 50; 

const coreUrls = [
  './',
  './index.html',
  './manifest.json'
];

const cdnDomains = [
  'tailwindcss.com',
  'cdnjs.cloudflare.com',
  'unpkg.com'
];

async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      const itemsToDelete = keys.slice(0, keys.length - maxItems);
      await Promise.all(itemsToDelete.map(key => cache.delete(key)));
    }
  } catch (e) {}
}

self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_CORE).then(cache => {
      return Promise.all(coreUrls.map(url => {
        return fetch(new Request(url, { cache: 'reload' })).then(res => {
          if (!res || !res.ok) throw new Error('Gagal pre-cache aset inti');
          return cache.put(url, res);
        });
      }));
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => {
        if (key.startsWith('fambarla-') && key !== CACHE_CORE && key !== CACHE_DYNAMIC) {
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' || url.pathname.endsWith('sw.js') || 
      url.hostname === 'script.google.com' || !url.protocol.startsWith('http')) return;

  const cleanUrl = req.url.split('?')[0];

  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('index.html') || url.pathname.endsWith('manifest.json')) {
    event.respondWith(
      fetch(req).then(res => {
        if (!res || (res.status !== 200 && res.type !== 'opaqueredirect')) throw new Error('Terindikasi Captive Portal');
        const resClone = res.clone();
        event.waitUntil(caches.open(CACHE_CORE).then(cache => cache.put(cleanUrl, resClone)));
        return res;
      }).catch(() => {
        return caches.match(cleanUrl).then(cachedRes => cachedRes || caches.match('./index.html', { ignoreSearch: true }));
      })
    );
    return;
  }

  if (cdnDomains.some(domain => url.hostname.includes(domain))) {
    event.respondWith(
      caches.match(cleanUrl).then(cachedRes => {
        if (cachedRes) return cachedRes; 
        return fetch(req).then(res => {
          if (!res || (res.status !== 200 && res.status !== 0)) return res;
          const resClone = res.clone();
          event.waitUntil(caches.open(CACHE_CORE).then(cache => cache.put(cleanUrl, resClone)));
          return res;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(cleanUrl).then(cachedRes => {
      const networkFetch = fetch(req).then(res => {
        if (res && res.status === 200) {
          const resClone = res.clone();
          event.waitUntil(
            caches.open(CACHE_DYNAMIC).then(cache => {
              cache.put(cleanUrl, resClone); 
              trimCache(CACHE_DYNAMIC, MAX_DYNAMIC_ITEMS); 
            })
          );
        }
        return res;
      });
      if (cachedRes) {
        event.waitUntil(networkFetch.catch(() => {}));
        return cachedRes;
      }
      return networkFetch.catch(() => new Response('', { status: 404 })); 
    })
  );
});
