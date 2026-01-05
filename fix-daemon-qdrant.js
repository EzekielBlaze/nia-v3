/**
 * FIX DAEMON FOR QDRANT
 * 
 * This script patches daemon.js to properly wire up Qdrant vector stores.
 * Run: node fix-daemon-qdrant.js
 */

const fs = require('fs');
const path = require('path');

console.log('\n╔════════════════════════════════════════╗');
console.log('║     FIX DAEMON FOR QDRANT              ║');
console.log('╚════════════════════════════════════════╝\n');

const daemonPath = path.join(__dirname, 'daemon.js');

// Check if daemon.js exists
if (!fs.existsSync(daemonPath)) {
  console.log('✗ daemon.js not found!');
  process.exit(1);
}

// Read the file
let content = fs.readFileSync(daemonPath, 'utf8');

// Check if already patched
if (content.includes('this.vectorClient = new VectorClient')) {
  console.log('✓ daemon.js already patched for Qdrant!');
  process.exit(0);
}

console.log('Patching daemon.js...\n');

// ============================================================================
// PATCH 1: Add imports after existing requires
// ============================================================================
const importMarker = 'const IPCServer = require("./ipc-server");';
const newImports = `const IPCServer = require("./ipc-server");

// Vector database (Qdrant) - for semantic memory/belief search
let VectorClient, VectorStoreMemories, VectorStoreBeliefs;
let VECTOR_MODULES_AVAILABLE = false;
try {
  VectorClient = require('./vector-client');
  VectorStoreMemories = require('./vector-store-memories');
  VectorStoreBeliefs = require('./vector-store-beliefs');
  VECTOR_MODULES_AVAILABLE = true;
} catch (err) {
  console.log('Vector modules not found - semantic search will be disabled');
}`;

if (content.includes(importMarker)) {
  content = content.replace(importMarker, newImports);
  console.log('✓ Added vector imports');
} else {
  console.log('⚠ Could not find import marker, skipping import patch');
}

// ============================================================================
// PATCH 2: Add vector properties in constructor
// ============================================================================
const dbMarker = 'this.db = null;';
const vectorProps = `this.db = null;
    
    // Vector database (Qdrant)
    this.vectorClient = null;
    this.vectorStoreMemories = null;
    this.vectorStoreBeliefs = null;
    this.qdrantAvailable = false;`;

if (content.includes(dbMarker) && !content.includes('this.vectorClient = null;')) {
  content = content.replace(dbMarker, vectorProps);
  console.log('✓ Added vector properties');
}

// ============================================================================
// PATCH 3: Initialize vector stores before integrators
// ============================================================================
// Find the MEMORY_SYSTEM_AVAILABLE block and add vector store creation
const oldIntegrators = `if (MEMORY_SYSTEM_AVAILABLE) {
      this.sessionManagerIntegrator = new SessionManagerIntegrator(this);
      this.chatHandlerIntegrator = new ChatHandlerIntegrator(this);
      this.memoryIntegrator = new MemoryIntegrator(this);
      this.correctionIntegrator = new CorrectionIntegrator(this);
      this.beliefIntegrator = new BeliefIntegrator(this);
    }`;

const newIntegrators = `if (MEMORY_SYSTEM_AVAILABLE) {
      // Initialize vector client for Qdrant (semantic search)
      if (VECTOR_MODULES_AVAILABLE) {
        this.vectorClient = new VectorClient({
          host: 'localhost',
          port: 6333,
          timeout: 5000
        });
        this.vectorStoreMemories = new VectorStoreMemories(this.vectorClient);
        this.vectorStoreBeliefs = new VectorStoreBeliefs(this.vectorClient);
      }
      
      // Create integrators (pass vector stores for semantic search)
      this.sessionManagerIntegrator = new SessionManagerIntegrator(this);
      this.chatHandlerIntegrator = new ChatHandlerIntegrator(this);
      this.memoryIntegrator = new MemoryIntegrator(this, this.vectorStoreMemories);
      this.correctionIntegrator = new CorrectionIntegrator(this);
      this.beliefIntegrator = new BeliefIntegrator(this, this.vectorStoreBeliefs);
    }`;

if (content.includes(oldIntegrators)) {
  content = content.replace(oldIntegrators, newIntegrators);
  console.log('✓ Patched integrator creation with vector stores');
} else {
  // Try a more flexible match
  const flexMatch = /if \(MEMORY_SYSTEM_AVAILABLE\) \{\s*this\.sessionManagerIntegrator = new SessionManagerIntegrator\(this\);\s*this\.chatHandlerIntegrator = new ChatHandlerIntegrator\(this\);\s*this\.memoryIntegrator = new MemoryIntegrator\(this\);\s*this\.correctionIntegrator = new CorrectionIntegrator\(this\);\s*this\.beliefIntegrator = new BeliefIntegrator\(this\);\s*\}/;
  
  if (flexMatch.test(content)) {
    content = content.replace(flexMatch, newIntegrators);
    console.log('✓ Patched integrator creation with vector stores (flexible match)');
  } else {
    console.log('⚠ Could not find integrator block - manual patch needed');
    console.log('  Look for: this.memoryIntegrator = new MemoryIntegrator(this);');
    console.log('  Change to: this.memoryIntegrator = new MemoryIntegrator(this, this.vectorStoreMemories);');
  }
}

// ============================================================================
// PATCH 4: Add Qdrant check in startup
// ============================================================================
const oldStartup = `if (MEMORY_SYSTEM_AVAILABLE) {
      logger.info("Initializing memory system...");
      this.sessionManagerIntegrator.init();
      await this.memoryIntegrator.init();
      this.correctionIntegrator.init();
      await this.beliefIntegrator.init();
      logger.info("Memory system ready");`;

const newStartup = `if (MEMORY_SYSTEM_AVAILABLE) {
      logger.info("Initializing memory system...");
      
      // Check Qdrant availability for semantic search
      if (this.vectorClient) {
        this.qdrantAvailable = await this.vectorClient.checkHealth();
        if (this.qdrantAvailable) {
          logger.info("✓ Qdrant connected - semantic search ENABLED");
          await this.vectorStoreMemories.init();
          await this.vectorStoreBeliefs.init();
        } else {
          logger.warn("⚠ Qdrant not running - semantic search DISABLED");
          logger.warn("  To enable: docker run -d -p 6333:6333 qdrant/qdrant");
        }
      }
      
      this.sessionManagerIntegrator.init();
      await this.memoryIntegrator.init();
      this.correctionIntegrator.init();
      await this.beliefIntegrator.init();
      logger.info("Memory system ready");
      if (this.vectorClient) {
        logger.info(\`  Qdrant: \${this.qdrantAvailable ? 'connected' : 'offline'}\`);
      }`;

if (content.includes(oldStartup)) {
  content = content.replace(oldStartup, newStartup);
  console.log('✓ Patched startup with Qdrant check');
} else {
  console.log('⚠ Could not find startup block - manual patch may be needed');
}

// ============================================================================
// Write the patched file
// ============================================================================

// Backup original
const backupPath = path.join(__dirname, 'daemon.js.backup-before-qdrant');
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(daemonPath, backupPath);
  console.log('\n✓ Created backup: daemon.js.backup-before-qdrant');
}

// Write patched file
fs.writeFileSync(daemonPath, content);
console.log('✓ Wrote patched daemon.js\n');

console.log('═══════════════════════════════════════════════════════════════');
console.log('DONE! The daemon is now wired for Qdrant.\n');
console.log('Next steps:');
console.log('  1. Start Qdrant: docker run -d -p 6333:6333 qdrant/qdrant');
console.log('  2. Start Python embedder: python memory-embedder-service.py');
console.log('  3. Start daemon: node daemon.js');
console.log('');
console.log('Run "node diagnose-nia.js" to verify everything is connected.');
console.log('═══════════════════════════════════════════════════════════════\n');
