/**
 * NIA DEBUG WEB SERVER
 * Logs all IPC responses to help debug JSON errors
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// IPC Connection
let daemonClient = null;
let daemonConnected = false;

async function ensureDaemonConnection() {
  if (!daemonClient) {
    try {
      const IPCClient = require('./ipc-client');
      daemonClient = new IPCClient();
    } catch (err) {
      console.warn('[Server] IPC client not available');
      return false;
    }
  }
  
  if (!daemonConnected) {
    try {
      await daemonClient.connect(2000);
      daemonConnected = true;
      console.log('[Server] ✅ Connected to daemon via TCP');
    } catch (err) {
      console.warn('[Server] ❌ Could not connect to daemon:', err.message);
      return false;
    }
  }
  
  return daemonConnected;
}

const PORT = 3000;
const HOST = 'localhost';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  console.log(`[${req.method}] ${pathname}`);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // API endpoints
  if (pathname.startsWith('/api/')) {
    await handleAPI(req, res, pathname);
    return;
  }
  
  // Static files
  let filePath = pathname === '/' ? '/nia-ui.html' : pathname;
  filePath = path.join(__dirname, filePath);
  
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) {
      res.writeHead(404);
      res.end(`File not found: ${pathname}`);
      return;
    }
    
    const ext = path.extname(filePath);
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Server error');
        return;
      }
      
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(data);
    });
  });
});

async function handleAPI(req, res, pathname) {
  const connected = await ensureDaemonConnection();
  
  if (!connected) {
    console.log('[API] ❌ Daemon not connected');
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: false, 
      error: 'Daemon not available - is it running?' 
    }));
    return;
  }
  
  try {
    let body = '';
    if (req.method === 'POST') {
      await new Promise((resolve) => {
        req.on('data', chunk => body += chunk);
        req.on('end', resolve);
      });
      
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    
    // Extract command from pathname
    const command = pathname.replace('/api/', '').replace(/\//g, '_');
    
    console.log(`[API] Calling daemon: ${command}`);
    
    // Make IPC request
    let result = await daemonClient.request(command, body);
    
    console.log(`[API] ✅ Response received for ${command}`);
    console.log(`[API] Response type: ${typeof result}`);
    console.log(`[API] Response keys: ${result ? Object.keys(result).join(', ') : 'null'}`);
    console.log(`[API] Full response:`, JSON.stringify(result, null, 2));
    
    // Send response
    const responseText = JSON.stringify(result);
    console.log(`[API] Sending JSON (${responseText.length} bytes)`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(responseText);
    
  } catch (err) {
    console.error(`[API] ❌ Error: ${err.message}`);
    console.error(`[API] Stack:`, err.stack);
    
    if (err.message.includes('Not connected') || err.message.includes('Connection')) {
      daemonConnected = false;
    }
    
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      success: false, 
      error: err.message 
    }));
  }
}

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('========================================');
  console.log('  NIA DEBUG WEB SERVER');
  console.log('========================================');
  console.log('');
  console.log(`  URL: http://${HOST}:${PORT}`);
  console.log('');
  console.log('  This server logs all IPC responses');
  console.log('  to help debug JSON parsing errors.');
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('========================================');
  console.log('');
  
  setTimeout(() => {
    const start = process.platform === 'win32' ? 'start' : 
                  process.platform === 'darwin' ? 'open' : 'xdg-open';
    require('child_process').exec(`${start} http://${HOST}:${PORT}`);
  }, 1000);
});

process.on('SIGINT', () => {
  console.log('');
  console.log('Shutting down...');
  
  if (daemonClient && daemonConnected) {
    daemonClient.disconnect();
    console.log('Disconnected from daemon');
  }
  
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});
