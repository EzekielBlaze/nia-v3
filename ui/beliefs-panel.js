/**
 * UI - BELIEFS PANEL
 * Widget panel for belief formation and viewing
 * ~100 lines (Target: <110)
 */

class BeliefsPanel {
  constructor(ipcClient) {
    this.ipcClient = ipcClient;
    this.container = null;
  }
  
  /**
   * Render the beliefs panel
   */
  render(container) {
    this.container = container;
    
    container.innerHTML = `
      <div class="beliefs-panel">
        <div class="beliefs-header">
          <h3>🧠 Belief System</h3>
          <button id="refresh-belief-stats" class="btn-small">Refresh</button>
        </div>
        
        <!-- Belief Stats -->
        <div class="belief-stats">
          <div class="stat-card">
            <span class="stat-label">Probation</span>
            <span class="stat-value" id="beliefs-probation">--</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Establishing</span>
            <span class="stat-value" id="beliefs-establishing">--</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Established</span>
            <span class="stat-value" id="beliefs-established">--</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Core</span>
            <span class="stat-value" id="beliefs-core">--</span>
          </div>
        </div>
        
        <!-- Actions -->
        <div class="belief-actions">
          <button id="form-beliefs-btn" class="btn-primary">Form Beliefs from Memories</button>
          <div id="formation-result" class="result-message"></div>
        </div>
        
        <!-- Maturity Distribution -->
        <div class="maturity-chart">
          <h4>Maturity Distribution</h4>
          <div id="maturity-bars" class="chart-bars"></div>
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
    // Refresh stats
    document.getElementById('refresh-belief-stats').addEventListener('click', () => {
      this._loadStats();
    });
    
    // Form beliefs
    document.getElementById('form-beliefs-btn').addEventListener('click', async () => {
      await this._formBeliefs();
    });
  }
  
  /**
   * Load belief statistics
   */
  async _loadStats() {
    try {
      const response = await this.ipcClient.send('belief_stats', {});
      
      if (response.success && response.stats.maturity) {
        // Update counts
        const maturity = response.stats.maturity;
        
        document.getElementById('beliefs-probation').textContent = 
          maturity.find(m => m.state === 'probation')?.count || 0;
        document.getElementById('beliefs-establishing').textContent = 
          maturity.find(m => m.state === 'establishing')?.count || 0;
        document.getElementById('beliefs-established').textContent = 
          maturity.find(m => m.state === 'established')?.count || 0;
        document.getElementById('beliefs-core').textContent = 
          maturity.find(m => m.state === 'core')?.count || 0;
        
        // Draw chart
        this._drawMaturityChart(maturity);
      }
    } catch (err) {
      console.error('Failed to load belief stats:', err);
    }
  }
  
  /**
   * Draw maturity distribution chart
   */
  _drawMaturityChart(maturity) {
    const barsDiv = document.getElementById('maturity-bars');
    const total = maturity.reduce((sum, m) => sum + m.count, 0);
    
    if (total === 0) {
      barsDiv.innerHTML = '<p class="no-data">No beliefs yet</p>';
      return;
    }
    
    const html = maturity.map(m => {
      const percentage = (m.count / total) * 100;
      return `
        <div class="bar-row">
          <span class="bar-label">${m.state}</span>
          <div class="bar-container">
            <div class="bar-fill" style="width: ${percentage}%"></div>
          </div>
          <span class="bar-value">${m.count}</span>
        </div>
      `;
    }).join('');
    
    barsDiv.innerHTML = html;
  }
  
  /**
   * Trigger belief formation
   */
  async _formBeliefs() {
    const resultDiv = document.getElementById('formation-result');
    const btn = document.getElementById('form-beliefs-btn');
    
    btn.disabled = true;
    resultDiv.textContent = '⏳ Forming beliefs...';
    resultDiv.className = 'result-message';
    
    try {
      const response = await this.ipcClient.send('form_beliefs', {});
      
      if (response.success) {
        const { formed, relationships } = response.result;
        resultDiv.textContent = `✅ Formed ${formed} beliefs, created ${relationships} relationships`;
        resultDiv.className = 'result-message success';
        
        // Refresh stats
        setTimeout(() => this._loadStats(), 1000);
      } else {
        resultDiv.textContent = `❌ ${response.error}`;
        resultDiv.className = 'result-message error';
      }
    } catch (err) {
      resultDiv.textContent = `❌ ${err.message}`;
      resultDiv.className = 'result-message error';
    } finally {
      btn.disabled = false;
    }
  }
}

// Export for use in widget
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BeliefsPanel;
}
