/**
 * UI - MEMORY PANEL
 * Widget panel for memory recall and commit
 * ~120 lines (Target: <130)
 */

class MemoryPanel {
  constructor(ipcClient) {
    this.ipcClient = ipcClient;
    this.container = null;
  }
  
  /**
   * Render the memory panel
   */
  render(container) {
    this.container = container;
    
    container.innerHTML = `
      <div class="memory-panel">
        <div class="memory-header">
          <h3>💭 Memory System</h3>
          <button id="refresh-memory-stats" class="btn-small">Refresh</button>
        </div>
        
        <!-- Memory Stats -->
        <div class="memory-stats">
          <div class="stat-card">
            <span class="stat-label">Total Memories</span>
            <span class="stat-value" id="total-memories">--</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Semantic Search</span>
            <span class="stat-value" id="semantic-status">--</span>
          </div>
        </div>
        
        <!-- Manual Commit -->
        <div class="memory-commit">
          <h4>Commit Memory</h4>
          <textarea id="memory-statement" 
                    placeholder="Enter statement to remember..."
                    rows="3"></textarea>
          <div class="commit-options">
            <select id="memory-type">
              <option value="observation">Observation</option>
              <option value="fact">Fact</option>
              <option value="preference">Preference</option>
              <option value="experience">Experience</option>
            </select>
            <button id="commit-memory-btn" class="btn-primary">Commit Memory</button>
          </div>
          <div id="commit-result" class="result-message"></div>
        </div>
        
        <!-- Memory Recall -->
        <div class="memory-recall">
          <h4>Recall Memories</h4>
          <input type="text" 
                 id="recall-query" 
                 placeholder="Search memories..."
                 class="search-input">
          <button id="recall-btn" class="btn-primary">Search</button>
          
          <div id="recall-results" class="results-list"></div>
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
    document.getElementById('refresh-memory-stats').addEventListener('click', () => {
      this._loadStats();
    });
    
    // Commit memory
    document.getElementById('commit-memory-btn').addEventListener('click', async () => {
      await this._commitMemory();
    });
    
    // Recall memories
    document.getElementById('recall-btn').addEventListener('click', async () => {
      await this._recallMemories();
    });
    
    // Enter key in recall
    document.getElementById('recall-query').addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        await this._recallMemories();
      }
    });
  }
  
  /**
   * Load memory statistics
   */
  async _loadStats() {
    try {
      const response = await this.ipcClient.send('memory_stats', {});
      
      if (response.success) {
        document.getElementById('total-memories').textContent = response.stats.total || 0;
        document.getElementById('semantic-status').textContent = 
          response.stats.semanticEnabled ? '✅ Enabled' : '❌ Disabled';
      }
    } catch (err) {
      console.error('Failed to load memory stats:', err);
    }
  }
  
  /**
   * Commit a memory
   */
  async _commitMemory() {
    const statement = document.getElementById('memory-statement').value.trim();
    const type = document.getElementById('memory-type').value;
    const resultDiv = document.getElementById('commit-result');
    
    if (!statement) {
      resultDiv.textContent = '❌ Please enter a statement';
      resultDiv.className = 'result-message error';
      return;
    }
    
    try {
      const response = await this.ipcClient.send('commit_memory', {
        statement,
        type
      });
      
      if (response.success) {
        resultDiv.textContent = `✅ Memory committed! (ID: ${response.memory.id})`;
        resultDiv.className = 'result-message success';
        document.getElementById('memory-statement').value = '';
        this._loadStats();
      } else {
        resultDiv.textContent = `❌ ${response.error}`;
        resultDiv.className = 'result-message error';
      }
    } catch (err) {
      resultDiv.textContent = `❌ ${err.message}`;
      resultDiv.className = 'result-message error';
    }
  }
  
  /**
   * Recall memories
   */
  async _recallMemories() {
    const query = document.getElementById('recall-query').value.trim();
    const resultsDiv = document.getElementById('recall-results');
    
    if (!query) {
      resultsDiv.innerHTML = '<p class="no-results">Enter a search query</p>';
      return;
    }
    
    resultsDiv.innerHTML = '<p class="loading">Searching...</p>';
    
    try {
      const response = await this.ipcClient.send('recall_memories', {
        query,
        limit: 10
      });
      
      if (response.success && response.memories.length > 0) {
        const html = response.memories.map(m => `
          <div class="memory-result">
            <div class="memory-statement">${m.statement}</div>
            <div class="memory-meta">
              Strength: ${(m.strength * 100).toFixed(0)}% | 
              Type: ${m.type} | 
              ${new Date(m.committedAt).toLocaleDateString()}
            </div>
          </div>
        `).join('');
        
        resultsDiv.innerHTML = html;
      } else {
        resultsDiv.innerHTML = '<p class="no-results">No memories found</p>';
      }
    } catch (err) {
      resultsDiv.innerHTML = `<p class="error">Error: ${err.message}</p>`;
    }
  }
}

// Export for use in widget
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MemoryPanel;
}
