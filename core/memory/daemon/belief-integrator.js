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
}

module.exports = BeliefIntegrator;
