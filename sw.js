/**
 * SERVICE WORKER STORE famBARLA (KASIR VERSION v30.8 - THE OMEGA)
 * Architecture: Clean Cache-Key (Anti-Leak), Strict Install (Anti-False Shell),
 * Network-First (Anti-Captive Portal), & Aggressive Memory Trimmer.
 */

const APP_VERSION = '40.0-OMEGA'; 

const CACHE_CORE = 'fambarla-core-v' + APP_VERSION; 
const CACHE_DYNAMIC = 'fambarla-dynamic-v' + APP_VERSION;
const MAX_DYNAMIC_ITEMS = 50; 

// Aset Inti (Nyawa Utama Aplikasi)
const coreUrls = [
  './',
  './index.html',
  './manifest.json'
];

// CDN Pihak Ketiga (Tailwind & FontAwesome)
const cdnDomains = [
  'tailwindcss.com',
  'cdnjs.cloudflare.com',
  'unpkg.com'
];

// ========================================================
// FUNGSI TUKANG PANGKAS MEMORI (Aman & Bebas Crash)
// ========================================================
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      const itemsToDelete = keys.slice(0, keys.length - maxItems);
      await Promise.all(itemsToDelete.map(key => cache.delete(key)));
    }
  } catch (e) {
    // Abaikan jika storage sedang di-lock oleh sistem OS
  }
}

// ========================================================
// TAHAP 1: INSTALASI STRICT (Anti "PWA Kosong")
// ========================================================
self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_CORE).then(cache => {
      return Promise.all(coreUrls.map(url => {
        // Wajib fetch dari server asli. Jika gagal, instalasi SW dibatalkan total.
        return fetch(new Request(url, { cache: 'reload' })).then(res => {
          if (!res || !res.ok) throw new Error('Gagal pre-cache aset inti');
          return cache.put(url, res);
        });
      }));
    })
  );
});

// ========================================================
// TAHAP 2: AKTIVASI (Pembersihan Kejam)
// ========================================================
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

// ========================================================
// TAHAP 3: INTERSEP JARINGAN
// ========================================================
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Filter Keamanan Mutlak
  if (req.method !== 'GET' || url.pathname.endsWith('sw.js') || 
      url.hostname === 'script.google.com' || !url.protocol.startsWith('http')) return;

  // Vaksin Kloning Memori: Ambil URL murni tanpa tanda tanya (?)
  const cleanUrl = req.url.split('?')[0];

  // --------------------------------------------------------
  // STRATEGI 1: NETWORK-FIRST (HTML & Manifest)
  // --------------------------------------------------------
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('index.html') || url.pathname.endsWith('manifest.json')) {
    event.respondWith(
      fetch(req).then(res => {
        if (!res || (res.status !== 200 && res.type !== 'opaqueredirect')) {
          throw new Error('Terindikasi Captive Portal');
        }
        const resClone = res.clone();
        // Simpan menggunakan cleanUrl agar tidak ada duplikasi di Brankas Inti
        event.waitUntil(caches.open(CACHE_CORE).then(cache => cache.put(cleanUrl, resClone)));
        return res;
      }).catch(() => {
        return caches.match(cleanUrl).then(cachedRes => {
          return cachedRes || caches.match('./index.html', { ignoreSearch: true });
        });
      })
    );
    return;
  }

  // --------------------------------------------------------
  // STRATEGI 2: CACHE-FIRST (Khusus CDN Opaque)
  // --------------------------------------------------------
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

  // --------------------------------------------------------
  // STRATEGI 3: STALE-WHILE-REVALIDATE (Aset Pendukung)
  // --------------------------------------------------------
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
        // Vaksin Anti-Background Kill: Lindungi proses fetch dari pembunuhan OS
        event.waitUntil(networkFetch.catch(() => {}));
        return cachedRes;
      }
      return networkFetch.catch(() => new Response('', { status: 404 })); 
    })
  );
});
