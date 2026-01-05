/**
 * NIA V3 - Simple Web Server
 * 
 * Serves the UI and connects to daemon
 * Just run: node nia-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// Try to load IPCClient
let IPCClient = null;
try {
  IPCClient = require('./ipc-client');
  console.log('âœ“ IPCClient loaded');
} catch (err) {
  console.log('âœ— IPCClient not available:', err.message);
}

const PORT = 3000;
const server = http.createServer(handleRequest);
const wss = new WebSocket.Server({ server });

console.log('\n=== NIA Web Server ===\n');

// Serve files or API
function handleRequest(req, res) {
  const url = req.url;
  
  // Serve UI
  if (url === '/' || url === '/index.html') {
    serveFile(res, 'nia-ui.html', 'text/html');
    return;
  }
  
  // Serve Debug Console
  if (url === '/debug' || url === '/debug.html') {
    serveFile(res, 'nia-debug.html', 'text/html');
    return;
  }
  
  // Serve Nia's picture
  if (url === '/Nia.png' || url === '/nia.png') {
    serveFile(res, 'Nia.png', 'image/png');
    return;
  }
  
  // API endpoint for daemon commands
  if (url.startsWith('/api/')) {
    handleAPI(req, res);
    return;
  }
  
  // Health check proxy endpoints (bypass CORS)
  if (url.startsWith('/health/')) {
    handleHealthProxy(req, res, url);
    return;
  }
  
  // Embedding proxy endpoint
  if (url.startsWith('/proxy/embed')) {
    handleEmbedProxy(req, res, url);
    return;
  }
  
  // 404
  res.writeHead(404);
  res.end('Not found');
}

// Serve static file
function serveFile(res, filename, contentType) {
  const filepath = path.join(__dirname, filename);
  
  if (!fs.existsSync(filepath)) {
    res.writeHead(404);
    res.end('File not found');
    return;
  }
  
  const content = fs.readFileSync(filepath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}

// Handle API calls to daemon
async function handleAPI(req, res) {
  res.setHeader('Content-Type', 'application/json');
  
  if (!IPCClient) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'IPC client not available' }));
    return;
  }
  
  // Parse command from URL
  const command = req.url.replace('/api/', '').split('?')[0];
  
  // Collect request body for POST
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      let data = {};
      if (body) {
        try {
          data = JSON.parse(body);
        } catch (e) {
          // Not JSON, that's ok
        }
      }
      
      // Connect to daemon
      const client = new IPCClient();
      await client.connect();
      
      // Send command
      const response = await client.request(command, data);
      
      client.disconnect();
      
      // Return response
      res.writeHead(200);
      res.end(JSON.stringify(response));
    } catch (err) {
      console.error(`API error (${command}):`, err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// Handle health check proxies (bypass browser CORS)
async function handleHealthProxy(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  
  const service = url.replace('/health/', '').split('?')[0];
  
  const endpoints = {
    'memory-embedder': 'http://localhost:5001/health',
    'belief-embedder': 'http://localhost:5002/health',
    'qdrant': 'http://localhost:6333/collections',
    'qdrant-memories': 'http://localhost:6333/collections/memories',
    'qdrant-beliefs': 'http://localhost:6333/collections/beliefs',
    'lm-studio': 'http://localhost:1234/v1/models'
  };
  
  const targetUrl = endpoints[service];
  
  if (!targetUrl) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Unknown service' }));
    return;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(targetUrl, { 
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      res.writeHead(response.status);
      res.end(JSON.stringify({ error: `HTTP ${response.status}` }));
      return;
    }
    
    const data = await response.json();
    res.writeHead(200);
    res.end(JSON.stringify(data));
    
  } catch (err) {
    console.log(`Health check failed for ${service}: ${err.message}`);
    res.writeHead(503);
    res.end(JSON.stringify({ error: err.message, offline: true }));
  }
}

// Handle embedding proxy (bypass browser CORS)
async function handleEmbedProxy(req, res, url) {
  res.setHeader('Content-Type', 'application/json');
  
  // Get service type from query param
  const urlObj = new URL(url, 'http://localhost');
  const type = urlObj.searchParams.get('type') || 'memory';
  
  const port = type === 'belief' ? 5002 : 5001;
  const targetUrl = `http://localhost:${port}/embed`;
  
  // Collect POST body
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        res.writeHead(response.status);
        res.end(JSON.stringify({ error: `HTTP ${response.status}` }));
        return;
      }
      
      const data = await response.json();
      res.writeHead(200);
      res.end(JSON.stringify(data));
      
    } catch (err) {
      console.log(`Embed proxy failed: ${err.message}`);
      res.writeHead(503);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// WebSocket for real-time updates
wss.on('connection', (ws) => {
  console.log('Client connected via WebSocket');
  
  // Send status updates every 5 seconds
  const interval = setInterval(async () => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(interval);
      return;
    }
    
    try {
      if (!IPCClient) return;
      
      const client = new IPCClient();
      await client.connect();
      
      const status = await client.request('status', {});
      const cogState = await client.request('cognitive_state', {});
      const identity = await client.request('identity_status', {});
      
      client.disconnect();
      
      ws.send(JSON.stringify({
        type: 'status',
        data: { status, cogState, identity }
      }));
    } catch (err) {
      // Daemon offline, that's ok
    }
  }, 5000);
  
  ws.on('close', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`âœ“ Server running at http://localhost:${PORT}`);
  console.log(`âœ“ Open browser to http://localhost:${PORT}\n`);
  
  // Try to open browser automatically
  const open = require('child_process').exec;
  const url = `http://localhost:${PORT}`;
  
  // Cross-platform browser open
  const cmd = process.platform === 'win32' ? `start ${url}` :
              process.platform === 'darwin' ? `open ${url}` :
              `xdg-open ${url}`;
  
  open(cmd, (err) => {
    if (err) {
      console.log('Could not open browser automatically.');
      console.log(`Please open: ${url}\n`);
    }
  });
});

console.log('Press Ctrl+C to stop\n');
