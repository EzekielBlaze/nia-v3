/**
 * UI - STATUS PANEL
 * Widget panel for system status
 * ~80 lines (Target: <90)
 */

class StatusPanel {
  constructor(ipcClient) {
    this.ipcClient = ipcClient;
    this.container = null;
    this.refreshInterval = null;
  }
  
  /**
   * Render the status panel
   */
  render(container) {
    this.container = container;
    
    container.innerHTML = `
      <div class="status-panel">
        <div class="status-header">
          <h3>📊 System Status</h3>
          <button id="refresh-status" class="btn-small">Refresh</button>
        </div>
        
        <!-- Daemon Status -->
        <div class="daemon-status">
          <h4>Daemon</h4>
          <div class="status-grid">
            <div class="status-item">
              <span class="label">Running:</span>
              <span id="daemon-running" class="value">--</span>
            </div>
            <div class="status-item">
              <span class="label">Uptime:</span>
              <span id="daemon-uptime" class="value">--</span>
            </div>
            <div class="status-item">
              <span class="label">Session ID:</span>
              <span id="session-id" class="value">--</span>
            </div>
          </div>
        </div>
        
        <!-- Memory System Status -->
        <div class="memory-system-status">
          <h4>Memory System</h4>
          <div class="status-grid">
            <div class="status-item">
              <span class="label">Memory Embedder:</span>
              <span id="memory-embedder" class="value">--</span>
            </div>
            <div class="status-item">
              <span class="label">Belief Embedder:</span>
              <span id="belief-embedder" class="value">--</span>
            </div>
            <div class="status-item">
              <span class="label">Semantic Search:</span>
              <span id="semantic-search" class="value">--</span>
            </div>
            <div class="status-item">
              <span class="label">Vector Store:</span>
              <span id="vector-store" class="value">--</span>
            </div>
          </div>
        </div>
        
        <!-- Quick Stats -->
        <div class="quick-stats">
          <h4>Quick Stats</h4>
          <div class="stats-row">
            <span>Memories: <strong id="quick-memories">--</strong></span>
            <span>Beliefs: <strong id="quick-beliefs">--</strong></span>
            <span>Corrections: <strong id="quick-corrections">--</strong></span>
          </div>
        </div>
      </div>
    `;
    
    this._attachEventListeners();
    this._loadStatus();
    
    // Auto-refresh every 5 seconds
    this.refreshInterval = setInterval(() => this._loadStatus(), 5000);
  }
  
  /**
   * Attach event listeners
   */
  _attachEventListeners() {
    document.getElementById('refresh-status').addEventListener('click', () => {
      this._loadStatus();
    });
  }
  
  /**
   * Load system status
   */
  async _loadStatus() {
    try {
      const response = await this.ipcClient.send('system_status', {});
      
      if (response.success) {
        const { daemon, session, uptime, memory, beliefs, corrections } = response.status;
        
        // Daemon status
        document.getElementById('daemon-running').textContent = daemon.running ? '✅ Yes' : '❌ No';
        document.getElementById('daemon-uptime').textContent = uptime || '--';
        document.getElementById('session-id').textContent = session?.sessionId || '--';
        
        // Memory system status
        const memResponse = await this.ipcClient.send('memory_system_status', {});
        
        if (memResponse.success) {
          const { embedder, semanticSearch, vectorStore } = memResponse.status;
          
          document.getElementById('memory-embedder').textContent = 
            embedder.memory ? '✅ Available' : '❌ Unavailable';
          document.getElementById('belief-embedder').textContent = 
            embedder.belief ? '✅ Available' : '❌ Unavailable';
          document.getElementById('semantic-search').textContent = 
            semanticSearch ? '✅ Enabled' : '❌ Disabled';
          document.getElementById('vector-store').textContent = 
            vectorStore.available ? '✅ Available' : '❌ Unavailable';
        }
        
        // Quick stats
        document.getElementById('quick-memories').textContent = memory?.total || 0;
        document.getElementById('quick-beliefs').textContent = 
          beliefs?.maturity?.reduce((sum, m) => sum + m.count, 0) || 0;
        document.getElementById('quick-corrections').textContent = corrections?.total || 0;
      }
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  }
  
  /**
   * Cleanup on destroy
   */
  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }
}

// Export for use in widget
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StatusPanel;
}
