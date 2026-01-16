// downloader.js - Video extraction and download functions
export async function checkCorsProxy(fetchProxy) {
    document.getElementById('status').textContent = 'Testing CORS proxy...';
    try {
        // Test the proxy with a simple request to httpbin.org
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

export async function downloadVideo(pyodide) {
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