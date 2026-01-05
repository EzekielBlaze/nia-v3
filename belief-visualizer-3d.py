"""
NIA BELIEF SPACE VISUALIZER - Data Generator
Extracts belief embeddings from database and projects to 3D
Generates data.json for the 3D dashboard
"""

import sqlite3
import json
import numpy as np
from sklearn.decomposition import PCA
from datetime import datetime
import os

def extract_embeddings(db_path):
    """Extract belief embeddings from database"""
    print("📖 Reading belief embeddings from database...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get beliefs with embeddings
    cursor.execute("""
        SELECT 
            b.id,
            b.belief_statement,
            b.belief_type,
            b.conviction_score,
            b.created_at,
            b.valid_from,
            b.valid_to,
            be.embedding,
            be.poincare_norm
        FROM beliefs b
        LEFT JOIN belief_embeddings be ON b.id = be.belief_id
        WHERE b.valid_to IS NULL
        ORDER BY b.created_at DESC
    """)
    
    beliefs = []
    embeddings = []
    
    for row in cursor.fetchall():
        belief_id, statement, btype, conviction, created, valid_from, valid_to, embedding_blob, poincare_norm = row
        
        # Skip if no embedding
        if not embedding_blob:
            continue
        
        # Deserialize embedding (stored as blob)
        # Assuming it's stored as numpy array bytes or JSON
        try:
            # Try JSON first
            embedding = json.loads(embedding_blob)
        except:
            # Try numpy
            try:
                embedding = np.frombuffer(embedding_blob, dtype=np.float32)
            except:
                print(f"⚠️  Skipping belief {belief_id} - couldn't parse embedding")
                continue
        
        belief_data = {
            'id': belief_id,
            'statement': statement,
            'type': btype or 'unknown',
            'conviction': conviction or 50,
            'created_at': created,
            'poincare_norm': poincare_norm or 0.5
        }
        
        beliefs.append(belief_data)
        embeddings.append(embedding)
    
    conn.close()
    
    print(f"✅ Loaded {len(beliefs)} beliefs with embeddings")
    return beliefs, np.array(embeddings)

def project_to_3d(embeddings):
    """Project high-dimensional embeddings to 3D using PCA"""
    print("🔮 Projecting to 3D space...")
    
    if len(embeddings) < 3:
        print("⚠️  Not enough beliefs for 3D projection")
        return embeddings
    
    # Use PCA to reduce dimensions while preserving variance
    pca = PCA(n_components=3)
    embeddings_3d = pca.fit_transform(embeddings)
    
    variance_explained = pca.explained_variance_ratio_
    print(f"📊 3D projection captures {sum(variance_explained)*100:.1f}% of variance")
    
    return embeddings_3d

def generate_visualization_data(db_path, output_path='belief-space-data.json'):
    """Generate JSON data for 3D visualization"""
    
    # Extract beliefs and embeddings
    beliefs, embeddings = extract_embeddings(db_path)
    
    if len(beliefs) == 0:
        print("❌ No beliefs with embeddings found!")
        print("   Make sure belief embeddings have been generated.")
        return None
    
    # Project to 3D
    embeddings_3d = project_to_3d(embeddings)
    
    # Combine belief data with 3D coordinates
    visualization_data = []
    
    for i, belief in enumerate(beliefs):
        x, y, z = embeddings_3d[i]
        
        visualization_data.append({
            **belief,
            'x': float(x),
            'y': float(y),
            'z': float(z),
            'distance_from_origin': float(np.sqrt(x**2 + y**2 + z**2))
        })
    
    # Create output object
    output = {
        'generated_at': datetime.now().isoformat(),
        'total_beliefs': len(beliefs),
        'belief_types': list(set(b['type'] for b in beliefs)),
        'beliefs': visualization_data
    }
    
    # Save to JSON
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"✅ Generated {output_path}")
    print(f"📍 {len(beliefs)} beliefs in 3D space")
    
    # Print statistics
    print("\n📊 Belief Space Statistics:")
    print(f"   Types: {', '.join(output['belief_types'])}")
    
    type_counts = {}
    for b in beliefs:
        t = b['type']
        type_counts[t] = type_counts.get(t, 0) + 1
    
    for btype, count in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"   - {btype}: {count}")
    
    avg_conviction = np.mean([b['conviction'] for b in beliefs])
    print(f"\n   Average conviction: {avg_conviction:.1f}%")
    
    return output_path

if __name__ == '__main__':
    import sys
    
    print("\n" + "="*60)
    print("NIA BELIEF SPACE VISUALIZER - Data Generator")
    print("="*60 + "\n")
    
    # Get database path
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    else:
        # Try default location
        db_path = 'data/nia.db'
        if not os.path.exists(db_path):
            db_path = input("Enter path to nia.db: ").strip()
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found: {db_path}")
        sys.exit(1)
    
    print(f"📂 Database: {db_path}\n")
    
    # Generate visualization data
    output = generate_visualization_data(db_path)
    
    if output:
        print(f"\n✨ Data ready! Now open belief-space-3d.html in your browser")
        print(f"   The dashboard will load {output}\n")
