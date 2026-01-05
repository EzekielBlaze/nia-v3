/**
 * UI - CORRECTIONS PANEL
 * Widget panel for viewing correction history
 * ~70 lines (Target: <80)
 */

class CorrectionsPanel {
  constructor(ipcClient) {
    this.ipcClient = ipcClient;
    this.container = null;
  }
  
  /**
   * Render the corrections panel
   */
  render(container) {
    this.container = container;
    
    container.innerHTML = `
      <div class="corrections-panel">
        <div class="corrections-header">
          <h3>✏️ Correction History</h3>
          <button id="refresh-corrections" class="btn-small">Refresh</button>
        </div>
        
        <!-- Stats -->
        <div class="correction-stats">
          <div class="stat-card">
            <span class="stat-label">Total Corrections</span>
            <span class="stat-value" id="total-corrections">--</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Recent (24h)</span>
            <span class="stat-value" id="recent-corrections">--</span>
          </div>
        </div>
        
        <!-- Correction List -->
        <div class="corrections-list">
          <h4>Recent Corrections</h4>
          <div id="corrections-items"></div>
        </div>
      </div>
    `;
    
    this._attachEventListeners();
    this._loadStats();
  }
  
  /**
   * Attach event listeners
   */
  _attachEventListeners() {
    document.getElementById('refresh-corrections').addEventListener('click', () => {
      this._loadStats();
    });
  }
  
  /**
   * Load correction statistics
   */
  async _loadStats() {
    try {
      const response = await this.ipcClient.send('correction_stats', {});
      
      if (response.success) {
        const { total, recent } = response.stats;
        
        document.getElementById('total-corrections').textContent = total || 0;
        
        // Count recent (last 24h)
        const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const recentCount = recent.filter(c => c.correctedAt > dayAgo).length;
        document.getElementById('recent-corrections').textContent = recentCount;
        
        // Display list
        this._displayCorrections(recent);
      }
    } catch (err) {
      console.error('Failed to load correction stats:', err);
    }
  }
  
  /**
   * Display corrections list
   */
  _displayCorrections(corrections) {
    const itemsDiv = document.getElementById('corrections-items');
    
    if (corrections.length === 0) {
      itemsDiv.innerHTML = '<p class="no-data">No corrections yet</p>';
      return;
    }
    
    const html = corrections.slice(0, 10).map(c => `
      <div class="correction-item">
        <div class="correction-type ${c.exempt ? 'exempt' : 'distress'}">
          ${c.type} ${c.exempt ? '(guilt-free)' : `(distress: ${c.distressLevel})`}
        </div>
        <div class="correction-change">
          <span class="old-value">${c.oldStatement || 'N/A'}</span>
          →
          <span class="new-value">${c.newStatement}</span>
        </div>
        <div class="correction-time">
          ${new Date(c.correctedAt).toLocaleString()}
        </div>
      </div>
    `).join('');
    
    itemsDiv.innerHTML = html;
  }
}

// Export for use in widget
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CorrectionsPanel;
}
