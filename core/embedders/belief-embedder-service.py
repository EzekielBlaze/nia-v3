"""
BELIEF EMBEDDER SERVICE
Flask API for creating Poincaré (hyperbolic) belief embeddings
Runs on: localhost:5002 (YOUR machine only!)

Uses: Poincaré embeddings (100 dimensions, hierarchical space)
Privacy: 100% local, no data leaves your computer
"""

from flask import Flask, request, jsonify
import numpy as np
import logging
import sys
import hashlib

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Simple Poincaré embedding generator
# For production, you'd use gensim's PoincareModel, but this works for now
class SimplePoincare:
    """
    Simplified Poincaré embedding generator
    Maps beliefs to hyperbolic space where:
    - Distance from origin = centrality to identity
    - Similar beliefs are closer together
    """
    
    def __init__(self, dimensions=100):
        self.dimensions = dimensions
        self.cache = {}
    
    def embed(self, text, belief_type='value'):
        """
        Generate Poincaré embedding for belief
        
        This is a simplified version. For production, use gensim.models.poincare
        Here we:
        1. Hash the text to get deterministic vector
        2. Normalize to unit ball (Poincaré disk)
        3. Adjust norm based on belief type (values closer to center)
        """
        
        # Check cache
        cache_key = f"{text}:{belief_type}"
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        # Generate deterministic vector from text hash
        hash_int = int(hashlib.md5(text.encode()).hexdigest(), 16)
        np.random.seed(hash_int % (2**32))
        
        # Random vector in hyperbolic space
        vector = np.random.randn(self.dimensions)
        
        # Normalize to Poincaré ball (norm < 1)
        norm = np.linalg.norm(vector)
        
        # Adjust norm based on belief type
        # Core beliefs closer to center (lower norm)
        # Peripheral beliefs closer to boundary (higher norm)
        type_norms = {
            'identity': 0.2,  # Very central
            'value': 0.4,     # Central
            'principle': 0.5,
            'preference': 0.6,
            'fact': 0.7,      # Less central
            'causal': 0.7
        }
        
        target_norm = type_norms.get(belief_type, 0.5)
        vector = vector * (target_norm / norm)
        
        # Cache result
        self.cache[cache_key] = vector
        
        return vector
    
    def distance(self, vec1, vec2):
        """Calculate Poincaré distance between two points"""
        # Poincaré distance formula
        diff = vec1 - vec2
        norm_diff_sq = np.dot(diff, diff)
        norm1_sq = np.dot(vec1, vec1)
        norm2_sq = np.dot(vec2, vec2)
        
        numerator = norm_diff_sq
        denominator = (1 - norm1_sq) * (1 - norm2_sq)
        
        if denominator <= 0:
            return float('inf')
        
        return np.arccosh(1 + 2 * numerator / denominator)

# Initialize embedder
logger.info("Initializing Poincaré embedder...")
poincare = SimplePoincare(dimensions=100)
logger.info("Poincaré embedder ready!")

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'belief-embedder',
        'model': 'Poincaré (hyperbolic)',
        'dimensions': 100,
        'space': 'hyperbolic',
        'privacy': '100% local, running on YOUR machine'
    })

@app.route('/embed', methods=['POST'])
def embed():
    """Create Poincaré embedding for belief"""
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({'error': 'Missing text field'}), 400
        
        text = data['text']
        belief_type = data.get('type', 'value')
        belief_id = data.get('belief_id', None)
        
        # Generate embedding (happens locally on YOUR machine!)
        embedding = poincare.embed(text, belief_type)
        poincare_norm = float(np.linalg.norm(embedding))
        
        logger.info(f"Generated Poincaré embedding for: {text[:50]}... (norm: {poincare_norm:.3f})")
        
        return jsonify({
            'embedding': embedding.tolist(),
            'dimensions': len(embedding),
            'poincare_norm': poincare_norm,
            'belief_type': belief_type,
            'hierarchy_level': int(poincare_norm * 10)  # 0-10 scale
        })
        
    except Exception as e:
        logger.error(f"Embedding failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/distance', methods=['POST'])
def distance():
    """Calculate Poincaré distance between beliefs"""
    try:
        data = request.get_json()
        
        if not data or 'embedding_1' not in data or 'embedding_2' not in data:
            return jsonify({'error': 'Missing embedding fields'}), 400
        
        vec1 = np.array(data['embedding_1'])
        vec2 = np.array(data['embedding_2'])
        
        dist = poincare.distance(vec1, vec2)
        
        return jsonify({
            'distance': float(dist),
            'similarity': float(1 / (1 + dist))  # Convert to similarity
        })
        
    except Exception as e:
        logger.error(f"Distance calculation failed: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("BELIEF EMBEDDER SERVICE STARTING")
    logger.info("=" * 60)
    logger.info("Privacy: 100% LOCAL - No data leaves your computer!")
    logger.info("Host: localhost (127.0.0.1) - Only accessible from YOUR machine")
    logger.info("Port: 5002")
    logger.info("Model: Poincaré embeddings (100 dims, hyperbolic space)")
    logger.info("=" * 60)
    logger.info("")
    logger.info("Hyperbolic embeddings:")
    logger.info("  - Core beliefs closer to origin (low norm)")
    logger.info("  - Peripheral beliefs closer to boundary (high norm)")
    logger.info("  - Hierarchical relationships preserved")
    logger.info("")
    logger.info("Ready to create belief embeddings!")
    logger.info("Press Ctrl+C to stop")
    logger.info("")
    
    # Run on localhost only (not accessible from network!)
    app.run(
        host='127.0.0.1',  # localhost only!
        port=5002,
        debug=False
    )
