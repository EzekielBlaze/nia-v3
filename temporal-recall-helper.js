/**
 * TEMPORAL RECALL HELPER
 * Detects temporal queries and returns recent memories
 * 
 * Add to daemon.js before memory recall section
 */

/**
 * Detect if query is asking about temporal/session context
 * Returns: { isTemporal, timeWindow, isSessionQuery }
 */
function detectTemporalQuery(message) {
  const lower = message.toLowerCase();
  
  const result = {
    isTemporal: false,
    timeWindow: null,
    isSessionQuery: false
  };
  
  // Session/conversation queries - MORE FLEXIBLE PATTERNS
  const sessionPatterns = [
    /what.*(have|did|'ve).*(we|you).*(talk|discuss|chat|cover)/i,
    /what.*(we|you).*(talk|discuss|chat|cover)/i,
    /what('s| is| was| are).*(our|the).*(conversation|discussion)/i,
    /what.*(you|we).*(learned|remember|know)/i,
    /remember.*(conversation|earlier|before|today)/i,
    /earlier.*(today|session|conversation)/i,
    /we (were|was) (talking|discussing)/i,
    /you (remember|know).*(told|said|mentioned)/i,
    /what do you (know|remember) about (me|us|today)/i,
    /what.*(talked|discussed|chatted).*(about|today)/i,
    /anything.*(else|more).*(talk|discuss|mention)/i,
    /what else.*(know|remember)/i,
    /tell me.*(we.*(discuss|talk)|you.*(remember|know))/i
  ];
  
  for (const pattern of sessionPatterns) {
    if (pattern.test(message)) {
      result.isTemporal = true;
      result.isSessionQuery = true;
      result.timeWindow = 'today';
      return result;
    }
  }
  
  // Time-specific queries
  const timePatterns = {
    'today': [/\btoday\b/i, /\bthis morning\b/i, /\bthis afternoon\b/i, /\bearlier\b/i, /\bjust now\b/i],
    'yesterday': [/\byesterday\b/i],
    'last_week': [/\blast week\b/i, /\bthis week\b/i, /\brecently\b/i, /\bfew days\b/i],
    'last_month': [/\blast month\b/i, /\bthis month\b/i]
  };
  
  for (const [window, patterns] of Object.entries(timePatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        result.isTemporal = true;
        result.timeWindow = window;
        return result;
      }
    }
  }
  
  return result;
}

/**
 * Get recent memories regardless of keyword match
 * For "what have we talked about" queries
 */
function getRecentMemories(db, timeWindow = 'today', limit = 10) {
  const cutoffs = {
    'today': Date.now() - (24 * 60 * 60 * 1000),
    'yesterday': Date.now() - (2 * 24 * 60 * 60 * 1000),
    'last_week': Date.now() - (7 * 24 * 60 * 60 * 1000),
    'last_month': Date.now() - (30 * 24 * 60 * 60 * 1000)
  };
  
  const cutoff = cutoffs[timeWindow] || cutoffs['today'];
  
  try {
    const memories = db.prepare(`
      SELECT 
        id,
        memory_statement,
        memory_type,
        committed_at,
        topics_json,
        subjects_json,
        strength,
        access_count,
        formation_context
      FROM memory_commits
      WHERE is_active = 1
        AND committed_at >= ?
      ORDER BY committed_at DESC
      LIMIT ?
    `).all(cutoff, limit);
    
    return memories.map(m => ({
      id: m.id,
      memory_statement: m.memory_statement,
      statement: m.memory_statement,
      type: m.memory_type,
      committedAt: m.committed_at,
      topics: JSON.parse(m.topics_json || '[]'),
      subjects: JSON.parse(m.subjects_json || '[]'),
      strength: m.strength,
      accessCount: m.access_count,
      formationContext: m.formation_context,
      source: 'temporal_recent'
    }));
  } catch (err) {
    console.error('Error getting recent memories:', err.message);
    return [];
  }
}

module.exports = { detectTemporalQuery, getRecentMemories };
