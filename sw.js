/**
 * SERVICE WORKER STORE famBARLA (KASIR VERSION v30.5 - THE ULTIMATE)
 * Perubahan: Anti-Recursive, Smart-Purge, Query-String Stripper, & Lifecycle Sync.
 */

const APP_VERSION = '30.5-ULTIMATE'; 

const CACHE_STATIC = 'fambarla-static-v' + APP_VERSION;
const CACHE_DYNAMIC = 'fambarla-dynamic-v' + APP_VERSION;
const MAX_DYNAMIC_ITEMS = 50; 

const coreAssets = [
  './',
  './index.html',
  './manifest.json'
];

const cdnAssets = [
  'tailwindcss.com',
  'cdnjs.cloudflare.com',
  'unpkg.com'
];

// --- TUKANG PANGKAS MEMORI (VERSI STABIL) ---
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      const itemsToDelete = keys.slice(0, keys.length - maxItems);
      await Promise.all(itemsToDelete.map(key => cache.delete(key)));
    }
  } catch (e) {
    console.error('Trim cache gagal (Storage penuh?):', e);
  }
}

// TAHAP 1: INSTALASI
self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return Promise.all(coreAssets.map(url => {
        // Gunakan cache.add dengan cache-busting agar selalu ambil yang terbaru dari server saat instalasi
        const request = new Request(url, { cache: 'reload' });
        return cache.add(request).catch(() => console.log('Gagal pre-cache:', url));
      }));
    })
  );
});

// TAHAP 2: AKTIVASI (PEMBERSIHAN TOTAL)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => {
        // Hapus SEMUA cache lama yang bukan milik versi ini
        if (key !== CACHE_STATIC && key !== CACHE_DYNAMIC) {
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

// TAHAP 3: JARINGAN (THE BRAIN)
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Filter Keamanan
  if (req.method !== 'GET' || url.pathname.endsWith('sw.js') || 
      url.hostname === 'script.google.com' || !url.protocol.startsWith('http')) return;

  // STRATEGI 1: NETWORK-FIRST (HTML & Manifest)
  if (req.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname.endsWith('manifest.json') || url.pathname === '/') {
    event.respondWith(
      fetch(req).then(res => {
        if (!res || (res.status !== 200 && res.type !== 'opaqueredirect')) throw new Error();
        const resClone = res.clone();
        caches.open(CACHE_DYNAMIC).then(cache => cache.put(req, resClone));
        return res;
      }).catch(() => {
        return caches.match(req, { ignoreSearch: true }).then(cachedRes => {
          return cachedRes || caches.match('./', { ignoreSearch: true }) || caches.match('./index.html', { ignoreSearch: true });
        });
      })
    );
    return; 
  }

  // STRATEGI 2: CACHE-FIRST (CDN & Library)
  if (cdnAssets.some(cdn => url.hostname.includes(cdn))) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(cachedRes => {
        if (cachedRes) return cachedRes; 
        return fetch(req).then(res => {
          if (!res || (res.status !== 200 && res.status !== 0)) return res;
          const resClone = res.clone();
          caches.open(CACHE_STATIC).then(cache => cache.put(req, resClone));
          return res;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // STRATEGI 3: STALE-WHILE-REVALIDATE (Aset Lain/Gambar/CSS Lokal)
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cachedRes => {
      const networkFetch = fetch(req).then(res => {
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_DYNAMIC).then(cache => {
            // Bersihkan URL dari parameter sebelum disimpan agar tidak duplikat
            const cleanUrl = req.url.split('?')[0];
            cache.put(cleanUrl, resClone);
            trimCache(CACHE_DYNAMIC, MAX_DYNAMIC_ITEMS);
          });
        }
        return res;
      }).catch(() => new Response('', { status: 404 }));
      
      if (cachedRes) {
        event.waitUntil(networkFetch);
        return cachedRes;
      }
      return networkFetch; 
    })
  );
});
