/**
 * BELIEF INTEGRATOR
 * Adds belief formation to NiaDaemon
 * ~115 lines (Target: <120)
 */

const {
  BeliefDetector,
  BeliefFormer,
  BeliefEmbedder,
  BeliefRelationship,
  BeliefMaturation
} = require('../formation');

const logger = require('../../../utils/logger');

class BeliefIntegrator {
  constructor(daemon, beliefVectorStore = null) {
    this.daemon = daemon;
    this.beliefVectorStore = beliefVectorStore; // Optional VectorStoreBeliefs
    
    this.beliefDetector = null;
    this.beliefFormer = null;
    this.beliefEmbedder = null;
    this.beliefRelationships = null;
    this.beliefMaturation = null;
    
    this.embedderAvailable = false;
  }
  
  /**
   * Initialize belief system
   */
  async init() {
    try {
      // Check if belief embedder service is available
      this.beliefEmbedder = new BeliefEmbedder('http://localhost:5002');
      this.embedderAvailable = await this.beliefEmbedder.checkHealth();
      
      if (!this.embedderAvailable) {
        logger.warn('Belief embedder service not available - hierarchical embedding disabled');
      }
      
      // Initialize components
      this.beliefDetector = new BeliefDetector(this.daemon.identityDbPath);
      this.beliefFormer = new BeliefFormer(
        this.daemon.identityDbPath,
        this.embedderAvailable ? this.beliefEmbedder : null
      );
      this.beliefRelationships = new BeliefRelationship(
        this.daemon.identityDbPath,
        this.embedderAvailable ? this.beliefEmbedder : null
      );
      this.beliefMaturation = new BeliefMaturation(this.daemon.identityDbPath);
      
      logger.info('Belief integrator initialized');
      logger.info(`  - Embedder: ${this.embedderAvailable ? 'available' : 'unavailable'}`);
      
      return true;
      
    } catch (err) {
      logger.error(`Failed to initialize belief integrator: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Detect and form beliefs from memory patterns
   */
  async formBeliefsFromMemories() {
    if (!this.beliefDetector || !this.beliefFormer) {
      logger.warn('Belief system not initialized');
      return { formed: 0, relationships: 0 };
    }
    
    try {
      // Detect candidates
      const candidates = this.beliefDetector.detectCandidates({
        minMemoryCount: 3,
        minTimeSpanDays: 7,
        minConfidence: 0.65
      });
      
      if (candidates.length === 0) {
        logger.debug('No belief candidates detected');
        return { formed: 0, relationships: 0 };
      }
      
      logger.info(`Detected ${candidates.length} belief candidates`);
      
      let formed = 0;
      let relationshipsCreated = 0;
      
      // Form beliefs
      for (const candidate of candidates) {
        const belief = await this.beliefFormer.formBelief(candidate);
        
        if (belief) {
          formed++;
          
          // Detect relationships
          const implicit = this.beliefRelationships.detectImplicitRelationships(belief.id);
          
          for (const rel of implicit) {
            await this.beliefRelationships.createRelationship(
              belief.id,
              rel.relatedBeliefId,
              rel.type,
              rel.strength
            );
            relationshipsCreated++;
          }
        }
      }
      
      // Update maturity states
      this.beliefMaturation.updateAllStates();
      
      logger.info(`Formed ${formed} beliefs, created ${relationshipsCreated} relationships`);
      
      return { formed, relationships: relationshipsCreated };
      
    } catch (err) {
      logger.error(`Failed to form beliefs: ${err.message}`);
      return { formed: 0, relationships: 0, error: err.message };
    }
  }
  
  /**
   * Get belief statistics
   */
  getStats() {
    if (!this.beliefMaturation) {
      return { total: 0, error: 'Not initialized' };
    }
    
    const maturityStats = this.beliefMaturation.getStats();
    const promotionCandidates = this.beliefMaturation.getPromotionCandidates();
    
    return {
      embedderAvailable: this.embedderAvailable,
      maturity: maturityStats,
      promotionCandidates: promotionCandidates.total
    };
  }
  
  /**
   * Check if belief is in probation (guilt-free period)
   */
  isInProbation(beliefId) {
    if (!this.beliefMaturation) return false;
    return this.beliefMaturation.isInProbation(beliefId);
  }
  
  /**
   * Embed all beliefs that don't have vector_id to Qdrant
   */
  async embedAllBeliefs() {
    if (!this.embedderAvailable || !this.beliefEmbedder) {
      return { error: 'Embedder not available', embedded: 0 };
    }
    
    try {
      const Database = require('better-sqlite3');
      const db = new Database(this.daemon.identityDbPath);
      
      // Ensure vector_id column exists
      try {
        db.exec(`ALTER TABLE beliefs ADD COLUMN vector_id TEXT`);
        logger.info('Added vector_id column to beliefs table');
      } catch (err) {
        // Column already exists - this is fine
      }
      
      // Ensure poincare columns exist
      try {
        db.exec(`ALTER TABLE beliefs ADD COLUMN poincare_norm REAL`);
        db.exec(`ALTER TABLE beliefs ADD COLUMN hierarchy_level INTEGER`);
        db.exec(`ALTER TABLE beliefs ADD COLUMN embedding_model TEXT`);
      } catch (err) {
        // Columns already exist
      }
      
      // Get all beliefs without poincare_norm (re-embed even if vector_id exists)
      const beliefs = db.prepare(`
        SELECT id, belief_statement, belief_type 
        FROM beliefs 
        WHERE poincare_norm IS NULL AND valid_to IS NULL
      `).all();
      
      logger.info(`Embedding ${beliefs.length} beliefs to Qdrant...`);
      
      let embedded = 0;
      let failed = 0;
      
      for (const belief of beliefs) {
        try {
          // embed() now returns full result with poincare_norm
          const result = await this.beliefEmbedder.embed(
            belief.id,
            belief.belief_statement,
            belief.belief_type || 'value'
          );
          
          // Store in Qdrant
          await this.beliefEmbedder.storeInQdrant(result.vectorId, result.embedding, {
            belief_id: belief.id,
            statement: belief.belief_statement.substring(0, 500),
            type: belief.belief_type,
            poincare_norm: result.poincare_norm,
            hierarchy_level: result.hierarchy_level
          });
          
          // Update SQLite with vector_id AND poincare metrics
          db.prepare(`
            UPDATE beliefs 
            SET vector_id = ?, 
                embedding_model = 'poincare-v1',
                poincare_norm = ?, 
                hierarchy_level = ?
            WHERE id = ?
          `).run(
            result.vectorId, 
            result.poincare_norm, 
            result.hierarchy_level,
            belief.id
          );
          
          embedded++;
          
          if (embedded % 10 === 0) {
            logger.info(`  Embedded ${embedded}/${beliefs.length}...`);
          }
        } catch (err) {
          logger.warn(`Failed to embed belief ${belief.id}: ${err.message}`);
          failed++;
        }
      }
      
      db.close();
      
      logger.info(`Embedding complete: ${embedded} embedded, ${failed} failed`);
      
      return { 
        embedded, 
        failed, 
        total: beliefs.length,
        success: true
      };
      
    } catch (err) {
      logger.error(`embedAllBeliefs failed: ${err.message}`);
      return { error: err.message, embedded: 0 };
    }
  }
}

module.exports = BeliefIntegrator;
