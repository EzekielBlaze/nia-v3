# NIA 3D Belief Space Visualizer

## 🌌 What This Does

Turns NIA's belief embeddings into an **interactive 3D landscape** you can explore in your browser!

- **Rotate, zoom, pan** around her belief space
- **Click beliefs** to see full details
- **Filter by type** (values, facts, preferences, etc.)
- **Distance from center** = how central to her identity
- **Color-coded** by belief type
- **Size** = conviction strength

## 📦 Installation

```bash
pip install scikit-learn numpy --break-system-packages
```

## 🚀 Usage

### Step 1: Generate the 3D Data

```bash
python belief-visualizer-3d.py path/to/nia.db
```

This creates `belief-space-data.json` with your beliefs projected to 3D.

### Step 2: Open the Dashboard

Just double-click `belief-space-3d.html` or open it in your browser!

The dashboard will load the data and show you NIA's mind as a 3D space.

## 🎨 What You'll See

```
        🌌 NIA's Mind Space
        
     ┌─────────────────────┐
     │    ⚫ identity       │  ← Core (center)
     │  ⚫   values   ⚫     │
     │ ⚫  beliefs  ⚫   ⚫   │
     │⚫    facts     ⚫   ⚫ │  ← Facts (edge)
     └─────────────────────┘
```

**Red spheres** = Identity/core beliefs (closest to center)
**Orange** = Values & principles  
**Green** = Preferences  
**Blue** = Facts & causal beliefs  
**Purple** = Other

**Bigger spheres** = Higher conviction
**Smaller spheres** = Lower conviction

## 🔄 Updating the Visualization

Whenever NIA forms new beliefs, just run:

```bash
python belief-visualizer-3d.py path/to/nia.db
```

Then refresh the HTML page - new beliefs will appear!

## 🤔 Troubleshooting

**"No beliefs with embeddings found"**
- Make sure the belief embedder service has run
- Check if `belief_embeddings` table exists
- Run: `node extract-beliefs-v2.js --process`

**"Module not found: sklearn"**
- Install scikit-learn: `pip install scikit-learn --break-system-packages`

**Dashboard shows "Error loading data"**
- Make sure `belief-space-data.json` is in the same folder as the HTML file
- Run the Python script first!

## 🎯 Cool Things to Look For

1. **Belief clusters** - Related beliefs form neighborhoods
2. **Core vs peripheral** - Distance from center shows importance
3. **Evolution over time** - Run daily, watch beliefs move!
4. **Conflict zones** - Beliefs far apart might contradict
5. **Dense regions** - Topics NIA thinks about a lot

## 🔮 Future Features

- Time slider (watch beliefs form over time)
- Belief connections (lines showing relationships)
- Export to video (rotating tour)
- VR mode (explore in 3D space)

---

**Made with 💜 for Project Chromaflux**
