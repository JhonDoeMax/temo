// main.js
let pyodide;

// Register Service Worker for CORS proxy
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('sw.js');
      console.log('Service Worker registered:', registration);
      return registration;
    } catch (error) {
      console.log('Service Worker registration failed:', error);
    }
  }
}

// JavaScript networking proxy for yt-dlp
async function fetchProxy(url, options = {}) {
  // Use CORS proxy for YouTube requests
  const isYouTubeRequest = url.includes('youtube.com') || url.includes('googlevideo.com') ||
                          url.includes('youtubei.googleapis.com') || url.includes('ytimg.com');

  let proxyUrl = url;
  if (isYouTubeRequest) {
    // Use corsfix.com proxy
    proxyUrl = `https://corsfix.com/${url}`;
  }

  try {
    const response = await fetch(proxyUrl, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      mode: 'cors',
      credentials: 'omit'
    });

    const headers = {};
    for (let [key, value] of response.headers.entries()) {
      headers[key] = value;
    }

    const arrayBuffer = await response.arrayBuffer();

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
        throw directError;
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

    // Monkey-patch urllib to use JavaScript fetch proxy
    await pyodide.runPythonAsync(`
import sys
import js
import asyncio
from urllib.request import Request, urlopen
from urllib.error import HTTPError

class JSFetchResponse:
    def __init__(self, js_response, url):
        self.js_response = js_response
        self.url = url
        self.status = js_response.status
        self.headers = js_response.headers

    def read(self, amt=None):
        data = bytes(self.js_response.body)
        if amt is None:
            return data
        else:
            return data[:amt]

    def readinto(self, b):
        raise NotImplementedError

    def close(self):
        pass

    def geturl(self):
        return self.url

async def urlopen_async(url, data=None, headers=None, **kwargs):
    options = {
        'method': 'POST' if data else 'GET',
        'headers': headers or {},
        'body': data
    }

    try:
        js_response = await js.fetchProxy(url, options)
        return JSFetchResponse(js_response, url)
    except Exception as e:
        print(f"Async fetch failed: {e}")
        raise

# Synchronous wrapper (this won't work perfectly but let's try)
def urlopen_cors(url, data=None, headers=None, **kwargs):
    # Try to run async in sync context - this will likely fail
    try:
        # This is a hack and probably won't work
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(urlopen_async(url, data, headers, **kwargs))
        loop.close()
        return result
    except Exception as e:
        print(f"CORS urlopen failed: {e}")
        # Fallback to original
        return urlopen(url, data, headers, **kwargs)

# Patch urllib
import urllib.request
urllib.request.urlopen = urlopen_cors

print('JavaScript fetch proxy CORS patch applied')
    `);

    // Set up event listeners
    document.getElementById('extract-btn').addEventListener('click', extractFormats);
    document.getElementById('download-btn').addEventListener('click', downloadVideo);

    document.getElementById('status').textContent = 'Ready to download!';
}

async function extractFormats() {
    const url = document.getElementById('url-input').value;
    if (!url) return alert('Enter a URL');

    try {
        document.getElementById('status').textContent = 'Extracting formats...';
        let formats;

        // Try yt-dlp first
        try {
            const result = await pyodide.runPythonAsync(`
import yt_dlp
ydl = yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True, 'extract_flat': False})
info = ydl.extract_info("""${url}""", download=False)
formats_list = info.get('formats', [])
            `);
            formats = pyodide.globals.get('formats_list');
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
