// sw.js - Service Worker for CORS proxy
const CACHE_NAME = 'yt-dlp-cache-v1';

self.addEventListener('install', (event) => {
  console.log('Service Worker installing.');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating.');
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Proxy requests to youtube.com and related domains
  if (url.hostname.includes('youtube.com') ||
      url.hostname.includes('googlevideo.com') ||
      url.hostname.includes('youtubei.googleapis.com') ||
      url.hostname.includes('ytimg.com')) {

    event.respondWith(
      fetch(event.request.url, {
        method: event.request.method,
        headers: {
          ...Object.fromEntries(event.request.headers.entries()),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://www.youtube.com/',
          'Origin': 'https://www.youtube.com'
        },
        mode: 'cors',
        credentials: 'omit'
      }).catch((error) => {
        console.log('Proxy fetch failed:', error);
        // Fallback to direct fetch if proxy fails
        return fetch(event.request);
      })
    );
  }
});