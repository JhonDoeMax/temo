// proxy.js - CORS proxy related functions
export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('Service Worker registered:', registration);

      // Wait for the service worker to be ready
      await navigator.serviceWorker.ready;
      console.log('Service Worker ready');

      return registration;
    } catch (error) {
      console.log('Service Worker registration failed:', error);
      console.log('Continuing without Service Worker - using CORS proxy only');
    }
  } else {
    console.log('Service Workers not supported - using CORS proxy only');
  }
}

// JavaScript networking proxy for yt-dlp
export async function fetchProxy(url, options = {}) {
  console.log('fetchProxy called with URL:', url);

  // Use CORS proxy for YouTube requests
  const isYouTubeRequest = url.includes('youtube.com') || url.includes('googlevideo.com') ||
                          url.includes('youtubei.googleapis.com') || url.includes('ytimg.com');

  let proxyUrl = url;
  if (isYouTubeRequest) {
    // Use corsfix.com proxy - try without encoding first
    proxyUrl = `https://proxy.corsfix.com/?${url}`;
    console.log('Using corsfix proxy:', proxyUrl);
  } else {
    console.log('Not a YouTube request, using direct URL');
  }

  try {
    console.log('Making fetch request to:', proxyUrl);
    const response = await fetch(proxyUrl, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      mode: 'cors',
      credentials: 'omit'
    });

    console.log('Response status:', response.status, response.statusText);

    const headers = {};
    for (let [key, value] of response.headers.entries()) {
      headers[key] = value;
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log('Response body size:', arrayBuffer.byteLength);

    return {
      status: response.status,
      statusText: response.statusText,
      headers: headers,
      body: arrayBuffer
    };
  } catch (error) {
    console.log('Fetch proxy error:', error);
    // Fallback to direct request if proxy fails
    if (isYouTubeRequest) {
      try {
        console.log('Trying direct fetch for:', url);
        const directResponse = await fetch(url, {
          method: options.method || 'GET',
          headers: options.headers || {},
          body: options.body,
          mode: 'cors',
          credentials: 'omit'
        });

        const headers = {};
        for (let [key, value] of directResponse.headers.entries()) {
          headers[key] = value;
        }

        const arrayBuffer = await directResponse.arrayBuffer();

        return {
          status: directResponse.status,
          statusText: directResponse.statusText,
          headers: headers,
          body: arrayBuffer
        };
      } catch (directError) {
        console.log('Direct fetch also failed:', directError);
        // Try a different CORS proxy as fallback
        try {
          const altProxyUrl = `https://cors-anywhere.herokuapp.com/${url}`;
          console.log('Trying alternative proxy:', altProxyUrl);
          const altResponse = await fetch(altProxyUrl, {
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body,
            mode: 'cors',
            credentials: 'omit'
          });

          const headers = {};
          for (let [key, value] of altResponse.headers.entries()) {
            headers[key] = value;
          }

          const arrayBuffer = await altResponse.arrayBuffer();

          return {
            status: altResponse.status,
            statusText: altResponse.statusText,
            headers: headers,
            body: arrayBuffer
          };
        } catch (altError) {
          console.log('Alternative proxy also failed:', altError);
          throw directError;
        }
      }
    }
    throw error;
  }
}