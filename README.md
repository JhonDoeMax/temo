# yt-dlp WASM Browser Port

A proof-of-concept port of yt-dlp to run in web browsers using Pyodide + WebAssembly.

## 🚀 Live Demo
https://temo-omega.vercel.app

## ✅ What's Working
- **Pyodide Integration**: yt-dlp loads successfully in browser via micropip
- **UI/UX**: Clean mobile-responsive interface for URL input and format selection
- **CORS Infrastructure**: Service Worker + proxy setup for cross-origin requests
- **Build System**: Vite-based development with Vercel deployment
- **Error Handling**: Graceful fallbacks and user feedback

## ❌ Current Limitations
- **Networking**: yt-dlp's synchronous HTTP requests incompatible with browser async fetch
- **SSL/TLS**: Pyodide's SSL implementation doesn't work in browser sandbox
- **WebSocket**: Mixed content issues with WSS requirements

## 🔧 Technical Architecture
```
Frontend: Vanilla JS + Pyodide (Python in WASM)
Core: yt-dlp via micropip.install('yt-dlp')
CORS: corsfix.com proxy + Service Worker
Build: Vite + Vercel deployment
```

## 🎯 Achievements
- ✅ MVP structure complete
- ✅ Cross-platform compatibility (works on desktop/mobile)
- ✅ Modern web standards (PWA-ready)
- ✅ Extensible for future enhancements

## 🚧 Next Steps for Production
1. **Server-Side Proxy**: Move yt-dlp to server with API for browser client
2. **Async yt-dlp**: Modify yt-dlp to support async networking
3. **Alternative Libraries**: Use youtube-dl-exec or similar for browser compatibility

## 📊 Development Status
- **Phase 1 (MVP)**: ✅ Complete - Basic functionality with networking limitations
- **Phase 2 (Multi-site)**: 🔄 In Progress - Framework ready, needs networking fix
- **Phase 3 (PWA)**: ✅ Service Worker implemented
- **Phase 4 (FFmpeg)**: 📋 Planned - Ready for integration

## 🛠️ Local Development
```bash
npm install
npm run dev  # Local development server
npm run build  # Production build
```

## 📝 API Usage
```javascript
// Load yt-dlp in Pyodide
await pyodide.loadPackage("micropip");
await pyodide.runPythonAsync(`
  import micropip
  await micropip.install('yt-dlp')
  import yt_dlp
`);

// Extract formats (currently limited by CORS)
const info = await ydl.extract_info(url, download=false);
```

## 🤝 Contributing
This project demonstrates the challenges and possibilities of running complex Python libraries in browsers. Contributions welcome for networking solutions or alternative approaches.

## 📄 License
MIT License