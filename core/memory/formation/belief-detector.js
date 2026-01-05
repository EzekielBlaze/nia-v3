/**
 * BELIEF DETECTOR
 * Detects patterns in memories that should become beliefs
 * ~140 lines (Target: <150)
 */

const Database = require('better-sqlite3');
const logger = require('../../../utils/logger');
const TimeFormatter = require('../temporal/time-formatter');

class BeliefDetector {
  constructor(dbPath) {
    this.db = new Database(dbPath);
  }
  
  /**
   * Detect belief candidates from memory patterns
   */
  detectCandidates(options = {}) {
    const {
      minMemoryCount = 3,
      minTimeSpanDays = 7,
      minConfidence = 0.65
    } = options;
    
    // Get rules from database
    const rules = this.db.prepare(`
      SELECT * FROM belief_formation_rules
      WHERE is_active = 1
    `).all();
    
    const candidates = [];
    
    for (const rule of rules) {
      const ruleCandidates = this._detectByRule(rule);
      candidates.push(...ruleCandidates);
    }
    
    logger.info(`Detected ${candidates.length} belief candidates`);
    
    return candidates;
  }
  
  /**
   * Detect candidates using a specific rule
   */
  _detectByRule(rule) {
    const candidates = [];
    
    // Group memories by topic
    const clusters = this._clusterMemoriesByTopic();
    
    for (const cluster of clusters) {
      if (cluster.memories.length < rule.min_memory_count) continue;
      
      const timeSpan = this._calculateTimeSpan(cluster.memories);
      if (timeSpan < rule.min_time_span_days) continue;
      
      const consistency = this._calculateConsistency(cluster.memories);
      if (rule.requires_consistency && consistency < rule.consistency_threshold) continue;
      
      // Synthesize belief statement from memories
      const statement = this._synthesizeStatement(cluster.memories);
      const confidence = this._calculateConfidence(cluster.memories, consistency);
      
      if (confidence >= rule.min_confidence) {
        candidates.push({
          statement,
          type: rule.belief_type,
          confidence,
          consistency,
          supportingMemories: cluster.memories.map(m => m.id),
          memoryCount: cluster.memories.length,
          timeSpan,
          topics: cluster.topics,
          rule: rule.rule_name
        });
      }
    }
    
    return candidates;
  }
  
  /**
   * Cluster memories by shared topics
   */
  _clusterMemoriesByTopic() {
    const memories = this.db.prepare(`
      SELECT 
        id,
        memory_statement,
        memory_type,
        committed_at,
        topics_json,
        subjects_json,
        strength
      FROM memory_commits
      WHERE is_active = 1
        AND strength >= 0.3
      ORDER BY committed_at DESC
      LIMIT 1000
    `).all();
    
    const topicMap = new Map();
    
    for (const memory of memories) {
      const topics = JSON.parse(memory.topics_json || '[]');
      
      for (const topic of topics) {
        if (!topicMap.has(topic)) {
          topicMap.set(topic, []);
        }
        topicMap.get(topic).push(memory);
      }
    }
    
    // Convert to clusters
    const clusters = [];
    for (const [topic, memories] of topicMap.entries()) {
      if (memories.length >= 2) {
        clusters.push({
          topics: [topic],
          memories
        });
      }
    }
    
    return clusters;
  }
  
  /**
   * Calculate time span in days
   */
  _calculateTimeSpan(memories) {
    const timestamps = memories.map(m => m.committed_at);
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    return (max - min) / 86400000; // Convert to days
  }
  
  /**
   * Calculate consistency (how similar are the memories?)
   */
  _calculateConsistency(memories) {
    // Simple heuristic: if all same type, high consistency
    const types = new Set(memories.map(m => m.memory_type));
    const typeConsistency = 1 / types.size;
    
    // If all high strength, high consistency
    const avgStrength = memories.reduce((sum, m) => sum + m.strength, 0) / memories.length;
    
    return (typeConsistency * 0.5) + (avgStrength * 0.5);
  }
  
  /**
   * Synthesize belief statement from memories
   */
  _synthesizeStatement(memories) {
    // For now, use the strongest memory as template
    const strongest = memories.reduce((max, m) => 
      m.strength > max.strength ? m : max
    );
    
    // Extract key concepts
    const subjects = new Set();
    memories.forEach(m => {
      JSON.parse(m.subjects_json || '[]').forEach(s => subjects.add(s));
    });
    
    return strongest.memory_statement;
  }
  
  /**
   * Calculate confidence score
   */
  _calculateConfidence(memories, consistency) {
    const countFactor = Math.min(1, memories.length / 10);
    const strengthFactor = memories.reduce((sum, m) => sum + m.strength, 0) / memories.length;
    
    return (countFactor * 0.3) + (strengthFactor * 0.4) + (consistency * 0.3);
  }
}

module.exports = BeliefDetector;
