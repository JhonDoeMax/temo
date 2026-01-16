// downloader.js - Video extraction and download functions
export async function checkCorsProxy(fetchProxy) {
    document.getElementById('status').textContent = 'Testing CORS proxy...';
    try {
        const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
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

export async function extractFormats(pyodide, fetchProxy) {
    const url = document.getElementById('url-input').value;
    if (!url) return alert('Enter a URL');

    try {
        document.getElementById('status').textContent = 'Extracting formats...';
        console.log('Starting format extraction for URL:', url);
        let formats;

        // Try yt-dlp first
        try {
            console.log('Calling yt-dlp extract_info...');

            // First, patch ALL networking in Python to go through our proxy
            await pyodide.runPythonAsync(`
import sys
import types
import io

# Create a mock socket module to prevent WebSocket usage
class MockSocket:
    def __init__(self, *args, **kwargs):
        pass

    def connect(self, *args, **kwargs):
        raise OSError("Socket connections disabled - using proxy instead")

    def send(self, *args, **kwargs):
        return 0

    def recv(self, *args, **kwargs):
        return b''

    def close(self):
        pass

class MockSocketModule:
    def __init__(self):
        self.AF_INET = 2
        self.SOCK_STREAM = 1
        self.SOCK_DGRAM = 2
        self.error = OSError
        self.timeout = OSError

    def socket(self, *args, **kwargs):
        return MockSocket()

    def create_connection(self, *args, **kwargs):
        raise OSError("create_connection disabled - using proxy instead")

    def gethostbyname(self, host):
        return "127.0.0.1"

# Patch socket module
sys.modules['socket'] = MockSocketModule()

# Now patch urllib to use our JavaScript proxy
import urllib.request
import urllib.error
import js

_original_urlopen = urllib.request.urlopen

async def patched_urlopen(req, *args, **kwargs):
    url_str = req.full_url if hasattr(req, 'full_url') else str(req)
    print(f"🎯 INTERCEPTED Python request to: {url_str}")

        try:
        # Prepare headers
        headers = {}
        if hasattr(req, 'headers'):
            headers.update(req.headers)

            options = {
            'method': req.get_method() if hasattr(req, 'get_method') else 'GET',
            'headers': headers,
            'body': req.data if hasattr(req, 'data') else None
            }

        print(f"🚀 Using JavaScript proxy for: {url_str}");
            js_response = await js.fetchProxy(url_str, options)

            class MockResponse:
                def __init__(self, js_resp):
                    self.status = js_resp.status
                self.reason = js_resp.statusText
                    self.headers = js_resp.headers
                self._content = bytes(js_resp.body)
                self._closed = False

                def read(self, amt=None):
                if amt is None:
                    return self._content
                data = self._content[:amt]
                self._content = self._content[amt:]
                return data

                def readinto(self, b):
                    raise NotImplementedError

                def close(self):
                self._closed = True

            def getcode(self):
                return self.status

                def geturl(self):
                    return url_str

                def info(self):
                    return self.headers

            def getheader(self, name, default=None):
                return self.headers.get(name, default)

            def readall(self):
                return self._content

            print(f"✅ Proxy response: {js_response.status}")
            return MockResponse(js_response)

        except Exception as e:
            print(f"❌ Proxy failed: {e}")
        # Try original as fallback
        return _original_urlopen(req, *args, **kwargs)

# Replace urlopen with our patched version
urllib.request.urlopen = patched_urlopen

# Also patch urllib.request.Request
_original_init = urllib.request.Request.__init__

def patched_request_init(self, url, data=None, headers={}, origin_req_host=None, unverifiable=False, method=None):
    _original_init(self, url, data, headers, origin_req_host, unverifiable, method)

urllib.request.Request.__init__ = patched_request_init

print("✅ Python networking layer patched!")
            `);

            // Now run yt-dlp with the patched networking
            const result = await pyodide.runPythonAsync(`
import yt_dlp

# Configure yt-dlp to use our patched networking
ydl_opts = {
    'quiet': True,
    'no_warnings': True,
    'extract_flat': False,
    # Force HTTP to avoid WebSocket issues
    'socket_timeout': 30,
    'http_headers': {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    }
}

try:
    ydl = yt_dlp.YoutubeDL(ydl_opts)
    print("✅ yt-dlp initialized with custom options")

    # Extract video info
info = ydl.extract_info("""${url}""", download=False)
    print(f"✅ Video info extracted, title: {info.get('title', 'Unknown')}")

    formats_list = info.get('formats', [])
    print(f"✅ Found {len(formats_list)} formats")

    # Return formats as a list
    result = []
    for fmt in formats_list:
        result.append({
            'format_id': fmt.get('format_id', ''),
            'format_note': fmt.get('format_note', ''),
            'ext': fmt.get('ext', ''),
            'resolution': fmt.get('resolution', ''),
            'filesize': fmt.get('filesize', 0),
            'fps': fmt.get('fps', 0),
            'vcodec': fmt.get('vcodec', ''),
            'acodec': fmt.get('acodec', '')
        })

    result
except Exception as e:
    print(f"❌ yt-dlp error: {e}")
    # Return empty list on error
    []
            `);
            formats = result;
            console.log('yt-dlp extraction successful, formats found:', formats.length);
        } catch (ytDlpError) {
            console.log('yt-dlp failed:', ytDlpError);
            throw new Error('Failed to extract formats. Try a different URL or check console.');
        }

        const select = document.getElementById('format-select');
        select.innerHTML = '';

        if (formats.length === 0) {
            document.getElementById('status').textContent = 'No formats found. Video may be private or restricted.';
            return;
        }

        for (let i = 0; i < formats.length; i++) {
            const fmt = formats[i];
            const option = document.createElement('option');

            // Build descriptive text
            let description = [];
            if (fmt.format_note) description.push(fmt.format_note);
            if (fmt.resolution) description.push(fmt.resolution);
            if (fmt.ext) description.push(fmt.ext.toUpperCase());

            if (fmt.filesize && fmt.filesize > 0) {
                description.push((fmt.filesize / 1024 / 1024).toFixed(2) + 'MB');
            }

            if (fmt.fps && fmt.fps > 0) description.push(fmt.fps + 'fps');

            option.value = fmt.format_id;
            option.textContent = description.join(' - ');
            select.appendChild(option);
        }

        document.getElementById('formats-container').style.display = 'block';
        document.getElementById('status').textContent = `✅ Found ${formats.length} formats! Select one to download.`;
    } catch (error) {
        document.getElementById('status').textContent = 'Error extracting formats: ' + error.message;
        console.error(error);
    }
}

export async function downloadVideo(pyodide, fetchProxy) {
    const url = document.getElementById('url-input').value;
    const formatId = document.getElementById('format-select').value;

    document.getElementById('progress-container').style.display = 'block';
    document.getElementById('status').textContent = 'Starting download...';

    try {
        // First patch networking again (in case extractFormats didn't run)
        await pyodide.runPythonAsync(`
import sys
import types
import io

# Create a mock socket module
class MockSocket:
    def __init__(self, *args, **kwargs):
        pass

    def connect(self, *args, **kwargs):
        raise OSError("Socket connections disabled")

    def send(self, *args, **kwargs):
        return 0

    def recv(self, *args, **kwargs):
        return b''

    def close(self):
        pass

class MockSocketModule:
    def __init__(self):
        self.AF_INET = 2
        self.SOCK_STREAM = 1
        self.error = OSError

    def socket(self, *args, **kwargs):
        return MockSocket()

sys.modules['socket'] = MockSocketModule()

import urllib.request
import js

_original_urlopen = urllib.request.urlopen

async def patched_urlopen(req, *args, **kwargs):
    url_str = req.full_url if hasattr(req, 'full_url') else str(req)

    try:
        headers = {}
        if hasattr(req, 'headers'):
            headers.update(req.headers)

        options = {
            'method': req.get_method() if hasattr(req, 'get_method') else 'GET',
            'headers': headers,
            'body': req.data if hasattr(req, 'data') else None
        }

        js_response = await js.fetchProxy(url_str, options)

        class MockResponse:
            def __init__(self, js_resp):
                self.status = js_resp.status
                self.reason = js_resp.statusText
                self.headers = js_resp.headers
                self._content = bytes(js_resp.body)
                self._pos = 0

            def read(self, amt=None):
                if amt is None:
                    data = self._content[self._pos:]
                    self._pos = len(self._content)
                    return data
                else:
                    end = self._pos + amt
                    data = self._content[self._pos:end]
                    self._pos = min(end, len(self._content))
                    return data

            def close(self):
                pass

            def getcode(self):
                return self.status

            def geturl(self):
                return url_str

        return MockResponse(js_response)

    except Exception as e:
        print(f"Proxy failed: {e}")
        return _original_urlopen(req, *args, **kwargs)

urllib.request.urlopen = patched_urlopen
print("✅ Download networking patched!")
        `);

        // Try to download using yt-dlp
        try {
            const fileName = await pyodide.runPythonAsync(`
import yt_dlp
import os
import js

progress_count = 0

def progress_hook(d):
    global progress_count
    progress_count += 1

    if d['status'] == 'downloading':
        percent = d.get('_percent_str', '0%').strip().strip('%')
        try:
            percent_float = float(percent)
        except:
            percent_float = 0

        # Update progress every 10 calls to avoid too many JS calls
        if progress_count % 10 == 0:
            js.document.getElementById('progress-bar').value = percent_float
            js.document.getElementById('progress-text').textContent = percent + '%'

            # Also update status with download speed if available
            if '_speed_str' in d:
                js.document.getElementById('status').textContent = 'Downloading... ' + d['_speed_str']

    elif d['status'] == 'finished':
        js.document.getElementById('status').textContent = 'Processing video...'
        js.document.getElementById('progress-bar').value = 100
        js.document.getElementById('progress-text').textContent = '100%'

# Configure yt-dlp for download
ydl_opts = {
    'outtmpl': '/tmp/%(title)s.%(ext)s',
    'progress_hooks': [progress_hook],
    'format': '${formatId}',
    'quiet': True,
    'no_warnings': True,
    'socket_timeout': 30,
    'http_headers': {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
}

try:
    ydl = yt_dlp.YoutubeDL(ydl_opts)
    info = ydl.extract_info("""${url}""", download=True)

    # Find the downloaded file
    files = [f for f in os.listdir('/tmp') if f.endswith(('.mp4', '.webm', '.m4a', '.mp3', '.mkv', '.flv'))]
    if files:
        files[0]
    else:
        "video.mp4"
except Exception as e:
    print(f"Download error: {e}")
    "error.mp4"
            `);

            console.log('Download completed, filename:', fileName);

            // Read the file from Pyodide filesystem
            const fileData = pyodide.FS.readFile('/tmp/' + fileName, { encoding: 'binary' });
            const blob = new Blob([fileData]);

                // Clean up
            pyodide.FS.unlink('/tmp/' + fileName);

        // Trigger download
            const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
            a.download = fileName;
            document.body.appendChild(a);
        a.click();
            document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

            document.getElementById('status').textContent = '✅ Download complete!';
        document.getElementById('progress-container').style.display = 'none';

        } catch (downloadError) {
            console.log('yt-dlp download failed:', downloadError);

            // Fallback: try to get direct URL using yt-dlp and download via fetch
            document.getElementById('status').textContent = 'Trying alternative download method...';

            const directUrl = await pyodide.runPythonAsync(`
import yt_dlp
import json

ydl = yt_dlp.YoutubeDL({
    'quiet': True,
    'no_warnings': True,
    'extract_flat': False,
    'format': '${formatId}'
})

try:
    info = ydl.extract_info("""${url}""", download=False)

    # Find the selected format
    selected_format = None
    for fmt in info.get('formats', []):
        if fmt.get('format_id') == '${formatId}':
            selected_format = fmt
            break

    if selected_format and selected_format.get('url'):
        selected_format['url']
    else:
        # Return the best available URL
        if info.get('url'):
            info['url']
        else:
            ""
except:
    ""
            `);

            if (directUrl) {
                document.getElementById('status').textContent = 'Downloading direct URL...';

                // Download via proxy
                const response = await fetchProxy(directUrl);
                const blob = new Blob([response.body]);

                const downloadUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = 'video.' + (formatId.includes('audio') ? 'mp3' : 'mp4');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);

                document.getElementById('status').textContent = '✅ Download complete (direct method)!';
            } else {
                throw new Error('Could not get video URL. Try a different format.');
            }
        }

    } catch (error) {
        document.getElementById('status').textContent = 'Download failed: ' + error.message;
        console.error(error);
        document.getElementById('progress-container').style.display = 'none';
    }
}