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

    // Set up event listeners
    document.getElementById('extract-btn').addEventListener('click', () => extractFormats(pyodide, fetchProxy));
    document.getElementById('download-btn').addEventListener('click', () => downloadVideo(pyodide, fetchProxy));
    document.getElementById('check-proxy-btn').addEventListener('click', () => checkCorsProxy(fetchProxy));

    document.getElementById('status').textContent = 'Ready to download!';
}

// Start the app
async function init() {
  await registerServiceWorker();
  await main();
}

init();