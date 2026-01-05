/**
 * MEMORY STORE
 * Stores episodic memories to database
 * ~115 lines (Target: <120)
 */

const Database = require('better-sqlite3');
const logger = require('../../../utils/logger');
const TimeFormatter = require('../temporal/time-formatter');
const { v4: uuidv4 } = require('uuid');

class MemoryStore {
  constructor(dbPath, embedder = null) {
    this.db = new Database(dbPath);
    this.embedder = embedder; // MemoryEmbedder instance
  }
  
  /**
   * Store a new memory
   */
  async store(statement, metadata = {}) {
    const {
      type = 'observation',
      sessionId = null,
      turnId = null,
      thinkingLogId = null,
      trigger = 'auto_extract',
      topics = [],
      subjects = [],
      formationContext = null
    } = metadata;
    
    const now = Date.now();
    const vectorId = `mem_${uuidv4()}`;
    
    // Get embedding if embedder available
    let embeddingCreated = false;
    if (this.embedder) {
      try {
        await this.embedder.embed(vectorId, statement, { topics, subjects });
        embeddingCreated = true;
      } catch (err) {
        logger.warn(`Failed to create embedding: ${err.message}`);
      }
    }
    
    // Store in database
    const result = this.db.prepare(`
      INSERT INTO memory_commits (
        memory_statement,
        memory_type,
        committed_at,
        temporal_bucket,
        relative_time_description,
        source_session_id,
        source_turn_id,
        source_thinking_log_id,
        commit_trigger,
        formation_context,
        topics_json,
        subjects_json,
        vector_id,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      statement,
      type,
      now,
      TimeFormatter.dateBucket(now),
      TimeFormatter.relativeTime(now),
      sessionId,
      turnId,
      thinkingLogId,
      trigger,
      formationContext,
      JSON.stringify(topics),
      JSON.stringify(subjects),
      vectorId
    );
    
    const memoryId = result.lastInsertRowid;
    
    logger.info(`Memory stored: ${memoryId} [${type}] "${statement.substring(0, 50)}..."`);
    
    return {
      id: memoryId,
      vectorId,
      statement,
      type,
      committedAt: now,
      embeddingCreated
    };
  }
  
  /**
   * Update memory strength
   */
  updateStrength(memoryId, newStrength) {
    this.db.prepare(`
      UPDATE memory_commits
      SET strength = ?
      WHERE id = ?
    `).run(newStrength, memoryId);
  }
  
  /**
   * Mark memory as superseded
   */
  supersede(oldMemoryId, newMemoryId) {
    this.db.prepare(`
      UPDATE memory_commits
      SET is_active = 0, superseded_by = ?
      WHERE id = ?
    `).run(newMemoryId, oldMemoryId);
  }
  
  /**
   * Get memory by ID
   */
  getById(memoryId) {
    return this.db.prepare(`
      SELECT * FROM memory_commits
      WHERE id = ?
    `).get(memoryId);
  }
}

module.exports = MemoryStore;
