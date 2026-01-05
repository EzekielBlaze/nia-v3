/**
 * NIA SIMPLE WEB SERVER
 * Just serves HTML files - no IPC dependency
 * Run: node nia-server-simple.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const HOST = 'localhost';

// MIME types
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

// Create server
const server = http.createServer((req, res) => {
  console.log(`[${req.method}] ${req.url}`);
  
  // Default to nia-ui.html
  let filePath = req.url === '/' ? '/nia-ui.html' : req.url;
  
  // Remove query string
  if (filePath.includes('?')) {
    filePath = filePath.split('?')[0];
  }
  
  filePath = path.join(__dirname, filePath);
  
  // Security check
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  // Check if file exists
  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) {
      console.error(`File not found: ${filePath}`);
      res.writeHead(404);
      res.end(`404 Not Found: ${req.url}`);
      return;
    }
    
    // Get MIME type
    const ext = path.extname(filePath);
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
    
    // Read and serve file
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

// Start server
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('========================================');
  console.log('  NIA SIMPLE WEB SERVER');
  console.log('========================================');
  console.log('');
  console.log(`  URL: http://${HOST}:${PORT}`);
  console.log('');
  console.log('  Files:');
  console.log(`    • http://${HOST}:${PORT}/nia-ui.html`);
  console.log(`    • http://${HOST}:${PORT}/widget-chat.html`);
  console.log('');
  console.log('  NOTE: API endpoints not available in simple mode');
  console.log('        Use nia-server.js for full features');
  console.log('');
  console.log('  Press Ctrl+C to stop');
  console.log('========================================');
  console.log('');
  
  // Try to open browser
  const start = process.platform === 'win32' ? 'start' : 
                process.platform === 'darwin' ? 'open' : 'xdg-open';
  
  setTimeout(() => {
    require('child_process').exec(`${start} http://${HOST}:${PORT}`);
  }, 1000);
});

// Handle shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log('Shutting down...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});
