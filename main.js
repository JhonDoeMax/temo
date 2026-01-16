// main.js
import { registerServiceWorker, fetchProxy } from './proxy.js';
import { checkCorsProxy, extractFormats, downloadVideo } from './downloader.js';

let pyodide;

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

    // Patch urllib handlers before importing yt-dlp
    await pyodide.runPythonAsync(`
import urllib.request
import asyncio
import js
from urllib.response import addinfourl
from io import BytesIO

# Patch HTTPHandler.http_open
original_http_open = urllib.request.HTTPHandler.http_open

def patched_http_open(self, req):
    url = req.full_url
    if any(domain in url for domain in ['youtube.com', 'googlevideo.com', 'youtubei.googleapis.com', 'ytimg.com']):
        print(f"🎯 INTERCEPTED HTTP request: {url}")
        headers = dict(req.headers)
        method = req.get_method()
        data = req.data
        options = {
            'method': method,
            'headers': headers,
            'body': data
        }
        async def _do():
            js_response = await js.fetchProxy(url, options)
            return js_response
        js_response = asyncio.get_event_loop().run_until_complete(_do())
        fp = BytesIO(bytes(js_response.body))
        resp = addinfourl(fp, js_response.headers, url, js_response.status)
        resp.msg = js_response.statusText
        resp.status = js_response.status
        print(f"✅ Proxy response: {js_response.status}")
        return resp
    else:
        return original_http_open(self, req)

urllib.request.HTTPHandler.http_open = patched_http_open

# Patch HTTPSHandler.https_open
original_https_open = urllib.request.HTTPSHandler.https_open

def patched_https_open(self, req):
    url = req.full_url
    if any(domain in url for domain in ['youtube.com', 'googlevideo.com', 'youtubei.googleapis.com', 'ytimg.com']):
        print(f"🎯 INTERCEPTED HTTPS request: {url}")
        headers = dict(req.headers)
        method = req.get_method()
        data = req.data
        options = {
            'method': method,
            'headers': headers,
            'body': data
        }
        async def _do():
            js_response = await js.fetchProxy(url, options)
            return js_response
        js_response = asyncio.get_event_loop().run_until_complete(_do())
        fp = BytesIO(bytes(js_response.body))
        resp = addinfourl(fp, js_response.headers, url, js_response.status)
        resp.msg = js_response.statusText
        resp.status = js_response.status
        print(f"✅ Proxy response: {js_response.status}")
        return resp
    else:
        return original_https_open(self, req)

urllib.request.HTTPSHandler.https_open = patched_https_open

print('urllib handlers patched')
    `);

    // Patch yt-dlp's networking directly
    await pyodide.runPythonAsync(`
import yt_dlp.networking
import js
import asyncio

# Monkey patch the urllib RequestHandler._send method
original_send = yt_dlp.networking._urllib.RequestHandler._send

def patched_send(self, request):
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

            async def _do_fetch():
                js_response = await js.fetchProxy(url, options)
                return js_response

            js_response = asyncio.get_event_loop().run_until_complete(_do_fetch())

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
            async def _orig_send():
                return await original_send(self, request)
            return asyncio.get_event_loop().run_until_complete(_orig_send())
    else:
        # Not a YouTube request, use original
        async def _orig_send():
            return await original_send(self, request)
        return asyncio.get_event_loop().run_until_complete(_orig_send())

# Apply the patch
yt_dlp.networking._urllib.RequestHandler._send = patched_send

print('yt-dlp networking layer patched')
    `);

    // Set up event listeners
    document.getElementById('extract-btn').addEventListener('click', () => extractFormats(pyodide, fetchProxy));
    document.getElementById('download-btn').addEventListener('click', () => downloadVideo(pyodide));
    document.getElementById('check-proxy-btn').addEventListener('click', () => checkCorsProxy(fetchProxy));

    document.getElementById('status').textContent = 'Ready to download!';
}

// Start the app
async function init() {
  await registerServiceWorker();
  await main();
}

init();