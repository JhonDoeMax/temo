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

    console.log('Installing yt-dlp...');
    document.getElementById('status').textContent = 'Loading yt-dlp...';

    try {
        // Install yt-dlp - NOTE: careful with indentation in Python string
        const pythonCode = `
        import micropip
        await micropip.install('yt-dlp')
print('✅ yt-dlp installed')
        `.trim(); // .trim() removes leading/trailing whitespace

        await pyodide.runPythonAsync(pythonCode);
    } catch (error) {
        console.error('Failed to install yt-dlp:', error);
        document.getElementById('status').textContent = 'Failed to install yt-dlp: ' + error.message;
        return;
    }

    // Set up event listeners
    document.getElementById('extract-btn').addEventListener('click', () => extractFormats(pyodide, fetchProxy));
    document.getElementById('download-btn').addEventListener('click', () => downloadVideo(pyodide, fetchProxy));
    document.getElementById('check-proxy-btn').addEventListener('click', () => checkCorsProxy(fetchProxy));

    document.getElementById('status').textContent = '✅ Ready! Enter YouTube URL and click "Extract Formats"';
}

// Start the app
async function init() {
  try {
  await registerServiceWorker();
  await main();
  } catch (error) {
    console.error('Init error:', error);
    document.getElementById('status').textContent = 'Initialization failed: ' + error.message;
  }
}

init();