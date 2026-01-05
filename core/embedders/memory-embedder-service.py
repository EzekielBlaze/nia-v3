"""
MEMORY EMBEDDER SERVICE
Flask API for creating Euclidean memory embeddings
Runs on: localhost:5001 (YOUR machine only!)

Uses: sentence-transformers/all-MiniLM-L6-v2 (384 dimensions)
Privacy: 100% local, no data leaves your computer
"""

from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
import logging
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Load model (downloads on first run, then cached locally)
logger.info("Loading sentence-transformers model...")
logger.info("This will download ~80MB on first run (cached after that)")
try:
    model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
    logger.info("Model loaded successfully!")
except Exception as e:
    logger.error(f"Failed to load model: {e}")
    sys.exit(1)

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'memory-embedder',
        'model': 'all-MiniLM-L6-v2',
        'dimensions': 384,
        'privacy': '100% local, running on YOUR machine'
    })

@app.route('/embed', methods=['POST'])
def embed():
    """Create embedding for text"""
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({'error': 'Missing text field'}), 400
        
        text = data['text']
        
        # Generate embedding (happens locally on YOUR machine!)
        embedding = model.encode(text, convert_to_numpy=True)
        
        logger.info(f"Generated embedding for: {text[:50]}...")
        
        return jsonify({
            'embedding': embedding.tolist(),
            'dimensions': len(embedding),
            'text_length': len(text)
        })
        
    except Exception as e:
        logger.error(f"Embedding failed: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/batch_embed', methods=['POST'])
def batch_embed():
    """Create embeddings for multiple texts"""
    try:
        data = request.get_json()
        
        if not data or 'texts' not in data:
            return jsonify({'error': 'Missing texts field'}), 400
        
        texts = data['texts']
        
        if not isinstance(texts, list):
            return jsonify({'error': 'texts must be a list'}), 400
        
        # Generate embeddings (batch processing is faster!)
        embeddings = model.encode(texts, convert_to_numpy=True)
        
        logger.info(f"Generated {len(embeddings)} embeddings")
        
        return jsonify({
            'embeddings': embeddings.tolist(),
            'count': len(embeddings)
        })
        
    except Exception as e:
        logger.error(f"Batch embedding failed: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("MEMORY EMBEDDER SERVICE STARTING")
    logger.info("=" * 60)
    logger.info("Privacy: 100% LOCAL - No data leaves your computer!")
    logger.info("Host: localhost (127.0.0.1) - Only accessible from YOUR machine")
    logger.info("Port: 5001")
    logger.info("Model: sentence-transformers/all-MiniLM-L6-v2 (384 dims)")
    logger.info("=" * 60)
    logger.info("")
    logger.info("Ready to create memory embeddings!")
    logger.info("Press Ctrl+C to stop")
    logger.info("")
    
    # Run on localhost only (not accessible from network!)
    app.run(
        host='127.0.0.1',  # localhost only!
        port=5001,
        debug=False
    )
