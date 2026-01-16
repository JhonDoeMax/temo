// main.js
let pyodide;

// Register Service Worker for CORS proxy
async function registerServiceWorker() {
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
async function fetchProxy(url, options = {}) {
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

// Make fetchProxy available to Pyodide
self.fetchProxy = fetchProxy;

async function main() {
    // Load Pyodide
    pyodide = await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.1/full/"
    });

    // Load required packages
    await pyodide.loadPackage("micropip");
    await pyodide.loadPackage("ssl");

    // Install yt-dlp
    await pyodide.runPythonAsync(`
        import micropip
        await micropip.install('yt-dlp')
        import yt_dlp
        print('yt-dlp loaded')
    `);

    // Patch yt-dlp's networking directly
    await pyodide.runPythonAsync(`
import yt_dlp.networking
import js

# Monkey patch the urllib RequestHandler._send method
original_send = yt_dlp.networking._urllib.RequestHandler._send

async def patched_send(self, request):
    url = request.url
    print(f"Intercepted yt-dlp request to: {url}")

    # Check if it's a YouTube/Google request
    if any(domain in url for domain in ['youtube.com', 'googlevideo.com', 'youtubei.googleapis.com', 'ytimg.com']):
        print(f"Using proxy for: {url}")
        try:
            # Call our JavaScript proxy
            options = {
                'method': request.method,
                'headers': dict(request.headers),
                'body': request.data
            }

            js_response = await js.fetchProxy(url, options)

            # Create a response object that yt-dlp expects
            class MockResponse:
                def __init__(self, js_resp):
                    self.status = js_resp.status
                    self.msg = js_resp.statusText
                    self.headers = js_resp.headers
                    self.fp = self

                def read(self, amt=None):
                    data = bytes(js_resp.body)
                    if amt is None:
                        return data
                    return data[:amt]

                def readinto(self, b):
                    raise NotImplementedError

                def close(self):
                    pass

                def geturl(self):
                    return url

                def info(self):
                    return self.headers

            return MockResponse(js_response)

        except Exception as e:
            print(f"Proxy failed: {e}")
            # Fall back to original method
            return await original_send(self, request)
    else:
        # Not a YouTube request, use original
        return await original_send(self, request)

# Apply the patch
yt_dlp.networking._urllib.RequestHandler._send = patched_send

print('yt-dlp networking layer patched')
    `);

    // Set up event listeners
    document.getElementById('extract-btn').addEventListener('click', extractFormats);
    document.getElementById('download-btn').addEventListener('click', downloadVideo);
    document.getElementById('check-proxy-btn').addEventListener('click', checkCorsProxy);

    document.getElementById('status').textContent = 'Ready to download!';
}

async function extractFormats() {
    const url = document.getElementById('url-input').value;
    if (!url) return alert('Enter a URL');

    try {
        document.getElementById('status').textContent = 'Extracting formats...';
        console.log('Starting format extraction for URL:', url);
        let formats;

        // Try yt-dlp first
        try {
            console.log('Calling yt-dlp extract_info...');
            const result = await pyodide.runPythonAsync(`
# Patch urllib directly after yt-dlp import
import yt_dlp
import urllib.request
import js

original_urlopen = urllib.request.urlopen

def patched_urlopen(url, data=None, headers=None, **kwargs):
    url_str = str(url)
    print(f"🎯 INTERCEPTED urllib request: {url_str}")

    if any(domain in url_str for domain in ['youtube.com', 'googlevideo.com', 'youtubei.googleapis.com', 'ytimg.com']):
        print(f"🚀 Using CORS proxy for: {url_str}")
        try:
            # Convert headers dict to proper format
            header_dict = {}
            if hasattr(url, 'headers'):
                for k, v in url.headers.items():
                    header_dict[k] = v
            if headers:
                header_dict.update(headers)

            options = {
                'method': 'POST' if data else 'GET',
                'headers': header_dict,
                'body': data
            }

            js_response = await js.fetchProxy(url_str, options)

            class MockResponse:
                def __init__(self, js_resp):
                    self.status = js_resp.status
                    self.msg = js_resp.statusText
                    self.headers = js_resp.headers
                    self.fp = self
                    self._data = bytes(js_resp.body)

                def read(self, amt=None):
                    return self._data if amt is None else self._data[:amt]

                def readinto(self, b):
                    raise NotImplementedError

                def close(self):
                    pass

                def geturl(self):
                    return url_str

                def info(self):
                    return self.headers

            print(f"✅ Proxy response: {js_response.status}")
            return MockResponse(js_response)

        except Exception as e:
            print(f"❌ Proxy failed: {e}")
            return original_urlopen(url, data, headers, **kwargs)
    else:
        return original_urlopen(url, data, headers, **kwargs)

urllib.request.urlopen = patched_urlopen

# Now run yt-dlp
ydl = yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True, 'extract_flat': False})
info = ydl.extract_info("""${url}""", download=False)
formats_list = info.get('formats', [])
            `);
            formats = pyodide.globals.get('formats_list');
            console.log('yt-dlp extraction successful, formats found:', formats.length);
        } catch (ytDlpError) {
            console.log('yt-dlp failed:', ytDlpError);
            throw new Error('Failed to extract formats. CORS or network issue.');
        }

        const select = document.getElementById('format-select');
        select.innerHTML = '';
        for (let i = 0; i < formats.length; i++) {
            const fmt = formats[i];
            const option = document.createElement('option');
            option.value = fmt.format_id;
            option.textContent = `${fmt.format_note || fmt.resolution || 'Unknown'} - ${fmt.ext} - ${fmt.filesize ? (fmt.filesize / 1024 / 1024).toFixed(2) + 'MB' : 'Unknown size'} - ${fmt.fps ? fmt.fps + 'fps' : ''}`;
            select.appendChild(option);
        }

        document.getElementById('formats-container').style.display = 'block';
        document.getElementById('status').textContent = 'Formats extracted!';
    } catch (error) {
        document.getElementById('status').textContent = 'Error extracting formats: ' + error.message;
        console.error(error);
    }
}

async function checkCorsProxy() {
    document.getElementById('status').textContent = 'Testing CORS proxy...';
    try {
        // Test the proxy with a simple request to httpbin.org
        const testUrl = 'https://httpbin.org/get';
        const response = await fetchProxy(testUrl);
        if (response.status === 200) {
            document.getElementById('status').textContent = '✅ CORS proxy is working!';
        } else {
            document.getElementById('status').textContent = '❌ CORS proxy returned status ' + response.status;
        }
    } catch (error) {
        document.getElementById('status').textContent = '❌ CORS proxy test failed: ' + error.message;
        console.error(error);
    }
}

async function downloadVideo() {
    const url = document.getElementById('url-input').value;
    const formatId = document.getElementById('format-select').value;

    document.getElementById('progress-container').style.display = 'block';
    document.getElementById('status').textContent = 'Downloading...';

    try {
        let stream;

        // Try yt-dlp first
        try {
            await pyodide.runPythonAsync(`
import yt_dlp
import js

def progress_hook(d):
    if d['status'] == 'downloading':
        percent = d.get('_percent_str', '0%')
        js.document.getElementById('progress-bar').value = float(percent.strip('%'))
        js.document.getElementById('progress-text').textContent = percent
    elif d['status'] == 'finished':
        js.document.getElementById('status').textContent = 'Processing download...'

ydl = yt_dlp.YoutubeDL({
    'outtmpl': '/tmp/%(title)s.%(ext)s',
    'progress_hooks': [progress_hook],
    'format': '${formatId}'
})
ydl.download(['""${url}""'])
            `);

            // Get file from Pyodide FS
            const filePath = await pyodide.runPythonAsync(`
import os
files = [f for f in os.listdir('/tmp') if f.endswith(('.mp4', '.webm', '.m4a', '.mp3'))]
files[0] if files else None
            `);

            if (filePath) {
                const fileData = pyodide.FS.readFile('/tmp/' + filePath, { encoding: 'binary' });
                stream = new Blob([fileData]);
            }
        } catch (ytDlpError) {
            console.log('yt-dlp download failed:', ytDlpError);
            throw new Error('Download failed. Try a different format or URL.');
        }

        // Trigger download
        const downloadUrl = URL.createObjectURL(stream);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = 'video.mp4'; // Default name
        a.click();
        URL.revokeObjectURL(downloadUrl);

        document.getElementById('status').textContent = 'Download complete!';
    } catch (error) {
        document.getElementById('status').textContent = 'Download failed: ' + error.message;
        console.error(error);
    }
}

// Start the app
async function init() {
  await registerServiceWorker();
  await main();
}

init();
