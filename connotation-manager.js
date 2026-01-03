/**
 * CONCEPT CONNOTATION MANAGER
 * 
 * Manages emotional associations with concepts.
 * Connotations BIAS behavior but do NOT create beliefs or resolve contradictions.
 * 
 * Key principle: "Beliefs say what is true. Connotations say what it costs."
 */

const Database = require('better-sqlite3');
const logger = require('./utils/logger');

class ConnotationManager {
  constructor(db) {
    this.db = db;
    this._initTables();
  }
  
  /**
   * Initialize connotation tables
   */
  _initTables() {
    // Tables are created by schema file
    // Just verify they exist
    const tables = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
        AND name IN ('concepts', 'concept_connotations', 'belief_concepts', 'connotation_evolution')
    `).all();
    
    if (tables.length < 4) {
      logger.warn('Connotation tables not found - run concept-connotation-schema.sql');
    }
  }
  
  /**
   * Get or create a concept
   */
  getConcept(conceptName) {
    let concept = this.db.prepare(`
      SELECT * FROM concepts WHERE concept_name = ?
    `).get(conceptName);
    
    if (!concept) {
      const result = this.db.prepare(`
        INSERT INTO concepts (concept_name) VALUES (?)
      `).run(conceptName);
      
      concept = {
        id: result.lastInsertRowid,
        concept_name: conceptName,
        created_at: Date.now()
      };
      
      logger.debug(`Created new concept: ${conceptName}`);
    }
    
    return concept;
  }
  
  /**
   * Extract concepts from a belief statement
   * Simple keyword extraction - can be enhanced with NLP
   */
  extractConcepts(statement) {
    const keywords = statement
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3); // Filter short words
    
    // Remove common words
    const stopWords = new Set(['that', 'this', 'with', 'from', 'have', 'been', 'were', 'will', 'would', 'could', 'should']);
    
    return keywords.filter(word => !stopWords.has(word));
  }
  
  /**
   * Link belief to concepts
   */
  linkBeliefToConcepts(beliefId, statement) {
    const concepts = this.extractConcepts(statement);
    
    for (const conceptName of concepts) {
      const concept = this.getConcept(conceptName);
      
      // Link belief to concept (ignore if already exists)
      try {
        this.db.prepare(`
          INSERT INTO belief_concepts (belief_id, concept_id, weight)
          VALUES (?, ?, 1.0)
        `).run(beliefId, concept.id);
        
        logger.debug(`Linked belief ${beliefId} to concept "${conceptName}"`);
      } catch (err) {
        // Already linked, ignore
      }
    }
    
    return concepts;
  }
  
  /**
   * Detect emotional valence from statement
   * Simple sentiment analysis - can be enhanced with LLM
   */
  detectValence(statement) {
    const positive = ['safe', 'good', 'great', 'love', 'valuable', 'important', 'trust', 'reliable', 'helpful', 'warm', 'kind'];
    const negative = ['unsafe', 'bad', 'hate', 'dangerous', 'harmful', 'fear', 'anxiety', 'cold', 'cruel', 'painful'];
    
    const stmtLower = statement.toLowerCase();
    
    let score = 0;
    for (const word of positive) {
      if (stmtLower.includes(word)) score += 0.2;
    }
    for (const word of negative) {
      if (stmtLower.includes(word)) score -= 0.2;
    }
    
    // Clamp to -1.0 to 1.0
    return Math.max(-1.0, Math.min(1.0, score));
  }
  
  /**
   * Detect intensity from statement
   */
  detectIntensity(statement) {
    const intensifiers = ['very', 'extremely', 'absolutely', 'critical', 'essential', 'crucial', 'vital'];
    const stmtLower = statement.toLowerCase();
    
    let intensity = 0.5; // baseline
    
    for (const word of intensifiers) {
      if (stmtLower.includes(word)) {
        intensity += 0.15;
      }
    }
    
    // Exclamation marks
    if (statement.includes('!')) {
      intensity += 0.1;
    }
    
    // Clamp to 0.0 to 1.0
    return Math.max(0.0, Math.min(1.0, intensity));
  }
  
  /**
   * Extract emotion tags from statement
   */
  extractEmotionTags(statement, valence) {
    const emotionMap = {
      positive: ['safety', 'trust', 'warmth', 'joy', 'confidence', 'relief'],
      negative: ['anxiety', 'fear', 'shame', 'anger', 'sadness', 'frustration']
    };
    
    const stmtLower = statement.toLowerCase();
    const tags = [];
    
    const emotions = valence >= 0 ? emotionMap.positive : emotionMap.negative;
    
    for (const emotion of emotions) {
      if (stmtLower.includes(emotion)) {
        tags.push(emotion);
      }
    }
    
    // If no explicit emotion, infer from valence
    if (tags.length === 0) {
      if (valence > 0.5) tags.push('positive');
      else if (valence < -0.5) tags.push('negative');
    }
    
    return tags;
  }
  
  /**
   * Form or reinforce connotation for a concept
   * SLOW accumulation - doesn't overwrite from single observation
   */
  reinforceConnotation(conceptName, statement, origin = 'observation') {
    const concept = this.getConcept(conceptName);
    
    // Detect emotional properties
    const newValence = this.detectValence(statement);
    const newIntensity = this.detectIntensity(statement);
    const emotionTags = this.extractEmotionTags(statement, newValence);
    
    // Get existing connotation
    const existing = this.db.prepare(`
      SELECT * FROM concept_connotations
      WHERE concept_id = ? AND origin = ?
      ORDER BY formed_at DESC
      LIMIT 1
    `).get(concept.id, origin);
    
    if (existing) {
      // SLOW ACCUMULATION - weighted average favoring existing
      const oldWeight = existing.reinforced_count + 1; // More history = more weight
      const newWeight = 1;
      const totalWeight = oldWeight + newWeight;
      
      const updatedValence = (existing.valence * oldWeight + newValence * newWeight) / totalWeight;
      const updatedIntensity = (existing.intensity * oldWeight + newIntensity * newWeight) / totalWeight;
      
      // Merge emotion tags
      const oldTags = JSON.parse(existing.emotion_tags || '[]');
      const mergedTags = [...new Set([...oldTags, ...emotionTags])];
      
      // Update
      this.db.prepare(`
        UPDATE concept_connotations
        SET 
          valence = ?,
          intensity = ?,
          emotion_tags = ?,
          reinforced_count = reinforced_count + 1,
          last_reinforced = ?
        WHERE id = ?
      `).run(
        updatedValence,
        updatedIntensity,
        JSON.stringify(mergedTags),
        Date.now(),
        existing.id
      );
      
      // Log evolution
      this.db.prepare(`
        INSERT INTO connotation_evolution 
        (concept_id, event_type, valence_before, valence_after, intensity_before, intensity_after, trigger_source)
        VALUES (?, 'reinforced', ?, ?, ?, ?, ?)
      `).run(
        concept.id,
        existing.valence,
        updatedValence,
        existing.intensity,
        updatedIntensity,
        statement.substring(0, 100)
      );
      
      logger.info(`Reinforced connotation for "${conceptName}": valence ${existing.valence.toFixed(2)} → ${updatedValence.toFixed(2)}`);
      
    } else {
      // Form new connotation (requires evidence threshold)
      const stability = Math.abs(newValence) > 0.5 ? 'persistent' : 'transient';
      
      this.db.prepare(`
        INSERT INTO concept_connotations
        (concept_id, valence, intensity, emotion_tags, origin, stability)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        concept.id,
        newValence,
        newIntensity,
        JSON.stringify(emotionTags),
        origin,
        stability
      );
      
      logger.info(`Formed new connotation for "${conceptName}": valence ${newValence.toFixed(2)}, intensity ${newIntensity.toFixed(2)}`);
    }
  }
  
  /**
   * Get connotation for a concept
   */
  getConnotation(conceptName) {
    const concept = this.db.prepare(`
      SELECT * FROM concepts WHERE concept_name = ?
    `).get(conceptName);
    
    if (!concept) return null;
    
    const connotations = this.db.prepare(`
      SELECT * FROM concept_connotations
      WHERE concept_id = ?
      ORDER BY last_reinforced DESC
    `).all(concept.id);
    
    if (connotations.length === 0) return null;
    
    // Average across all sources (weighted by reinforcement count)
    let totalWeight = 0;
    let weightedValence = 0;
    let weightedIntensity = 0;
    const allTags = new Set();
    
    for (const conn of connotations) {
      const weight = conn.reinforced_count + 1;
      totalWeight += weight;
      weightedValence += conn.valence * weight;
      weightedIntensity += conn.intensity * weight;
      
      const tags = JSON.parse(conn.emotion_tags || '[]');
      tags.forEach(tag => allTags.add(tag));
    }
    
    return {
      concept_name: conceptName,
      valence: weightedValence / totalWeight,
      intensity: weightedIntensity / totalWeight,
      emotion_tags: Array.from(allTags),
      sources: connotations.length
    };
  }
  
  /**
   * Process belief for connotation extraction
   * Called after belief is created/updated
   */
  processBeliefConnotations(beliefId, statement) {
    // Extract and link concepts
    const concepts = this.linkBeliefToConcepts(beliefId, statement);
    
    // Reinforce connotations for each concept
    for (const conceptName of concepts) {
      this.reinforceConnotation(conceptName, statement, 'observation');
    }
    
    return concepts;
  }
  
  /**
   * Decay connotations over time (call periodically)
   * Connotations fade without reinforcement
   */
  decayConnotations() {
    const now = Date.now();
    const dayInMs = 86400000;
    
    const connotations = this.db.prepare(`
      SELECT * FROM concept_connotations
      WHERE stability = 'transient'
    `).all();
    
    for (const conn of connotations) {
      const daysSinceReinforced = (now - (conn.last_reinforced || conn.formed_at)) / dayInMs;
      
      if (daysSinceReinforced > 30) {
        // Decay toward neutral
        const decayFactor = conn.decay_rate * daysSinceReinforced;
        const newValence = conn.valence * (1 - decayFactor);
        const newIntensity = conn.intensity * (1 - decayFactor);
        
        if (Math.abs(newValence) < 0.05 && newIntensity < 0.1) {
          // Fully decayed - remove
          this.db.prepare(`DELETE FROM concept_connotations WHERE id = ?`).run(conn.id);
          logger.debug(`Decayed connotation ${conn.id} - removed`);
        } else {
          // Partial decay
          this.db.prepare(`
            UPDATE concept_connotations
            SET valence = ?, intensity = ?
            WHERE id = ?
          `).run(newValence, newIntensity, conn.id);
          
          // Log decay
          this.db.prepare(`
            INSERT INTO connotation_evolution
            (concept_id, event_type, valence_before, valence_after, intensity_before, intensity_after)
            VALUES (?, 'decayed', ?, ?, ?, ?)
          `).run(conn.concept_id, conn.valence, newValence, conn.intensity, newIntensity);
        }
      }
    }
  }
  
  /**
   * Get emotional context for a belief
   * Returns how this belief "feels" based on concept connotations
   */
  getBeliefEmotionalContext(beliefId) {
    const concepts = this.db.prepare(`
      SELECT c.concept_name, bc.weight
      FROM belief_concepts bc
      JOIN concepts c ON bc.concept_id = c.id
      WHERE bc.belief_id = ?
    `).all(beliefId);
    
    if (concepts.length === 0) return null;
    
    let totalValence = 0;
    let totalIntensity = 0;
    let totalWeight = 0;
    const emotionTags = new Set();
    
    for (const { concept_name, weight } of concepts) {
      const conn = this.getConnotation(concept_name);
      if (conn) {
        totalValence += conn.valence * weight;
        totalIntensity += conn.intensity * weight;
        totalWeight += weight;
        conn.emotion_tags.forEach(tag => emotionTags.add(tag));
      }
    }
    
    if (totalWeight === 0) return null;
    
    return {
      valence: totalValence / totalWeight,
      intensity: totalIntensity / totalWeight,
      emotion_tags: Array.from(emotionTags),
      concept_count: concepts.length
    };
  }
}

module.exports = ConnotationManager;
