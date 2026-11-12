const APP_VERSION = '2026.11.12-3';
const SCOPE_URL = new URL('./', self.registration.scope).href;
const SCOPE_PATH = new URL(SCOPE_URL).pathname;
const CACHE_PREFIX = `werewolf-pwa-${encodeURIComponent(SCOPE_PATH)}-`;
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './css/spicy-immersive.css',
  './css/ipad-tabletop.css',
  './js/audio-fx.js',
  './js/spicy-prompts.js',
  './js/action-widgets.js',
  './js/opening-bluff.js',
  './js/exile-dawn-spicy.js',
  './js/party-awards.js',
  './js/ipad-ergonomics.js',
  './content/game-text.md',
  './manifest.json',
  './icon.svg',
  './icon-180.png',
  './icon-512.png',
  './generated_roles_fast/villager_01.jpg',
  './generated_roles_fast/werewolf_01.jpg',
  './generated_roles_fast/prophet_01.jpg',
  './generated_roles_fast/witch_01.jpg',
  './generated_roles_fast/hunter_01.jpg',
  './generated_roles_fast/guardian_01.jpg',
  './generated_roles_fast/gargoyle_01.jpg',
  './audio/god/dayStart.mp3',
  './audio/god/gameStart.mp3',
  './audio/god/gargoyleCheck.mp3',
  './audio/god/gargoyleKill.mp3',
  './audio/god/guardianAction.mp3',
  './audio/god/nightOpen.mp3',
  './audio/god/nightOpen_2.mp3',
  './audio/god/nightOpen_3.mp3',
  './audio/god/nightOpen_4.mp3',
  './audio/god/nightOpen_5.mp3',
  './audio/god/nightToDayTransition.mp3',
  './audio/god/prophetCheck.mp3',
  './audio/god/voiceOn.mp3',
  './audio/god/voteResult.mp3',
  './audio/god/voteStart.mp3',
  './audio/god/witchAction.mp3',
  './audio/god/wolfAction.mp3'
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
  if (asset.endsWith('.css')) {
    const validType = contentType.includes('text/css') || contentType === '';
    return validType && (await response.clone().text()).trim().length > 0;
  }
  if (asset.endsWith('.js')) {
    const validType = contentType.includes('javascript') || contentType.includes('ecmascript') || contentType === '';
    return validType && (await response.clone().text()).trim().length > 0;
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
  if (asset.endsWith('.png')) {
    const validType = contentType.includes('image/png') || contentType === '';
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    return validType && bytes.length > 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (asset.endsWith('.jpg')) {
    if (!contentType.includes('image/jpeg')) return false;
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8
      && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  if (asset.endsWith('.mp3')) {
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    const id3 = bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
    const frame = bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    const playable = contentType.includes('audio/mpeg') || contentType.includes('audio/mp3')
      || contentType.includes('application/octet-stream') || contentType === '';
    return playable && (id3 || frame);
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

function toRangeResponse(request, response) {
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader || !response || response.status !== 200) return Promise.resolve(response);
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return Promise.resolve(response);
  return response.clone().arrayBuffer().then(buffer => {
    const total = buffer.byteLength;
    if (!total || (!match[1] && !match[2])) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}` }
      });
    }
    let start;
    let end;
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${total}` }
        });
      }
      start = Math.max(total - suffixLength, 0);
      end = total - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}` }
      });
    }
    const headers = new Headers(response.headers);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(buffer.slice(start, end + 1), {
      status: 206,
      statusText: 'Partial Content',
      headers
    });
  });
}

async function coreResponse(asset, request = null) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(assetURL(asset));
  if (await isValidCoreResponse(asset, cached)) {
    return request ? toRangeResponse(request, cached) : cached;
  }
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
    event.respondWith(coreResponse(coreAsset, request));
  } else if (coreAsset) {
    event.respondWith(coreResponse(coreAsset, request));
  } else {
    event.respondWith(runtimeResponse(event));
  }
});
