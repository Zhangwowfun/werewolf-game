const APP_VERSION = '2026.10.29-1';
const SCOPE_URL = new URL('./', self.registration.scope).href;
const SCOPE_PATH = new URL(SCOPE_URL).pathname;
const CACHE_PREFIX = `werewolf-pwa-${encodeURIComponent(SCOPE_PATH)}-`;
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './content/game-text.md',
  './manifest.json',
  './icon.svg',
  './generated_roles_fast/villager_01.jpg',
  './generated_roles_fast/werewolf_01.jpg',
  './generated_roles_fast/prophet_01.jpg',
  './generated_roles_fast/witch_01.jpg',
  './generated_roles_fast/hunter_01.jpg',
  './generated_roles_fast/guardian_01.jpg',
  './generated_roles_fast/gargoyle_01.jpg'
];

function assetURL(path) {
  return new URL(path, SCOPE_URL).href;
}

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isInScope(request) {
  return isSameOrigin(request) && new URL(request.url).pathname.startsWith(SCOPE_PATH);
}

function getCoreAsset(request) {
  const path = new URL(request.url).pathname;
  return APP_SHELL.find(asset => new URL(assetURL(asset)).pathname === path);
}

async function isValidAppShellResponse(response) {
  if (!response || response.status !== 200) return false;
  if (!(response.headers.get('content-type') || '').includes('text/html')) return false;
  const text = await response.clone().text();
  return text.includes('id="app-root"') && text.includes('狼人杀');
}

function isCacheableAssetResponse(request, response) {
  return isInScope(request) && response && response.status === 200
    && !(response.headers.get('content-type') || '').includes('text/html');
}

async function isValidCoreResponse(asset, response) {
  if (asset === './' || asset === './index.html') return isValidAppShellResponse(response);
  if (!response || response.status !== 200) return false;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) return false;
  if (asset.endsWith('game-text.md')) {
    return /^##\s+voice\.nightStart\s*$/m.test(await response.clone().text());
  }
  if (asset.endsWith('manifest.json')) {
    try {
      const manifest = await response.clone().json();
      return Boolean(manifest && manifest.name && manifest.start_url === './index.html'
        && Array.isArray(manifest.icons) && manifest.icons.length);
    } catch (error) {
      return false;
    }
  }
  if (asset.endsWith('icon.svg')) {
    return contentType.includes('image/svg+xml') && /<svg[\s>]/i.test(await response.clone().text());
  }
  if (asset.endsWith('.jpg')) {
    if (!contentType.includes('image/jpeg')) return false;
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8
      && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  return false;
}

async function hasCompleteAppShell() {
  if (!(await caches.has(CACHE_NAME))) return false;
  const cache = await caches.open(CACHE_NAME);
  for (const asset of APP_SHELL) {
    if (!(await isValidCoreResponse(asset, await cache.match(assetURL(asset))))) return false;
  }
  return true;
}

async function precacheAppShell() {
  // A version is immutable. Never overwrite an existing cache that may still
  // belong to an active worker if a deployment forgot to change its version.
  const existed = await caches.has(CACHE_NAME);
  if (existed) {
    if (await hasCompleteAppShell()) return;
    throw new Error('Existing application cache is incomplete');
  }
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const asset of APP_SHELL) {
      const response = await fetch(assetURL(asset), { cache: 'reload' });
      if (!(await isValidCoreResponse(asset, response))) {
        throw new Error(`Required offline resource is invalid: ${asset}`);
      }
      await cache.put(assetURL(asset), response.clone());
    }
    if (!(await hasCompleteAppShell())) throw new Error('Offline resources were not saved completely');
  } catch (error) {
    // Only this newly-created, uninstalled version is disposable.
    await caches.delete(CACHE_NAME).catch(() => {});
    throw error;
  }
}

self.addEventListener('install', event => {
  // The first installation activates normally. Updates remain waiting until
  // the page requests SKIP_WAITING after the user chooses to update.
  event.waitUntil(precacheAppShell());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (!(await hasCompleteAppShell())) throw new Error('Cannot activate an incomplete offline version');
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    // Legacy unscoped caches are deliberately retained: their ownership cannot
    // be established when several games share the same origin.
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    event.waitUntil((async () => {
      if (await hasCompleteAppShell()) await self.skipWaiting();
    })());
  } else if (event.data.type === 'GET_OFFLINE_STATUS') {
    event.waitUntil((async () => {
      let ready = false;
      try { ready = await hasCompleteAppShell(); } catch (error) { /* Cache unavailable. */ }
      const port = event.ports && event.ports[0];
      if (port) port.postMessage({ type: 'OFFLINE_STATUS', ready, version: APP_VERSION });
    })());
  }
});

async function coreResponse(asset) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(assetURL(asset));
  if (await isValidCoreResponse(asset, cached)) return cached;
  // Fetching a deployed shell or text here could mix an unaccepted new release
  // with this worker. Missing core data must not silently change game versions.
  throw new Error('The active offline version is incomplete');
}

function roleFallbackAsset(request) {
  const relativePath = new URL(request.url).pathname.slice(SCOPE_PATH.length);
  const match = /^generated_roles_fast\/(villager|werewolf|prophet|witch|hunter|guardian|gargoyle)_(?:0[1-9]|10)\.jpg$/.exec(relativePath);
  return match ? `./generated_roles_fast/${match[1]}_01.jpg` : null;
}

async function runtimeResponse(event) {
  const request = event.request;
  const fallback = roleFallbackAsset(request);
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached && isCacheableAssetResponse(request, cached)
      && (!fallback || await isValidCoreResponse(fallback, cached))) return cached;
  try {
    const response = await fetch(request);
    if (fallback && !(await isValidCoreResponse(fallback, response))) {
      throw new Error('Role image is unavailable');
    }
    if (isCacheableAssetResponse(request, response)) {
      event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    }
    return response;
  } catch (error) {
    if (fallback) return coreResponse(fallback);
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !isInScope(request)) return;
  const coreAsset = getCoreAsset(request);
  if (request.mode === 'navigate' && coreAsset) {
    event.respondWith(coreResponse(coreAsset));
  } else if (coreAsset) {
    event.respondWith(coreResponse(coreAsset));
  } else {
    event.respondWith(runtimeResponse(event));
  }
});
