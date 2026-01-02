# NIA V3 - AI Companion with Evolving Identity

A daemon-based AI companion system with persistent identity, belief formation, and emotional growth.

## Status

✅ **Phase 1: Daemon Foundation (COMPLETE)**
- Windows Service (24/7 background operation)
- TCP-based IPC communication
- Electron desktop widget with chat UI
- Start Menu integration & auto-start

🟡 **Phase 2: Core Rebuild (60% COMPLETE)**
- ✅ Identity schema (SQLite - beliefs, scars, cognitive load)
- ✅ Thinking capture (`<think>` tags → database)
- ✅ Belief processor (extracts beliefs from thinking)
- ✅ Scar processor (handles formative moments)
- ✅ Widget UI (beliefs, warmth, wisdom display)
- ⏳ Personality tuning (in progress)
- ❌ Temporal awareness (session detection)

⏳ **Phase 3: Memory System (NOT STARTED)**
- Persistent conversation memory
- Semantic search with embeddings
- Tiered memory storage

## Architecture

```
NIA V3/
├── daemon.js              # Main daemon (chat, identity, belief processing)
├── belief-processor.js    # Extracts beliefs from thinking log
├── scar-processor.js      # Handles significant moments → warmth/wisdom
├── ipc-server.js          # TCP server (localhost:19700)
├── ipc-client.js          # TCP client for widget
├── widget-main.js         # Electron main process
├── widget-chat.html       # Chat UI with identity panel
├── launch-nia.js          # Smart launcher
├── install-shortcuts.js   # Start Menu installer
├── core/
│   └── identity/
│       └── identity-schema-v3.sql  # SQLite schema
├── utils/
│   ├── logger.js          # Logging system
│   └── config.js          # Configuration
└── data/
    ├── nia.db             # Identity database
    └── logs/              # Daily log files
```

## Features

### Working Now
- **24/7 Daemon**: Windows service that survives reboots
- **Chat Interface**: Electron widget with LM Studio integration
- **Thinking Capture**: Internal reasoning saved to database
- **Belief Formation**: Beliefs extracted from conversations with conviction scores
- **Identity Moments**: Warmth (positive) and Wisdom (growth) moments
- **Cognitive Load**: Daily mental budget tracking

### Identity System

NIA's identity evolves through conversation:

| Component | Description |
|-----------|-------------|
| **Beliefs** | Values/preferences extracted from thinking (conviction 0-100) |
| **Warmth** ✨ | Beautiful moments - connections, joy, understanding |
| **Wisdom** 📖 | Growth moments - lessons learned, realizations |
| **Cognitive Load** | Daily processing budget (prevents overwhelm) |

Beliefs strengthen with reinforcement and decay without it. Significant moments become permanent "scars" (warmth/wisdom) that shape behavior.

## Installation

### Prerequisites
- Windows 10/11
- Node.js v18+ 
- LM Studio (for local LLM)
- Administrator access (initial service install only)

### Quick Start

```bash
# Clone repository
git clone https://github.com/EzekielBlaze/nia-v3.git
cd nia-v3

# Install dependencies
npm install

# Initialize database
sqlite3 data/nia.db ".read core/identity/identity-schema-v3.sql"

# Install Windows service (requires admin)
node install-service.js

# Install shortcuts
node install-shortcuts.js

# Launch
node launch-nia.js
```

## Usage

### Start NIA
```bash
# From Start Menu
Windows key → "NIA"

# Or manually
node launch-nia.js
```

### Service Management
```bash
sc start niaservice.exe    # Start service
sc stop niaservice.exe     # Stop service
sc query niaservice.exe    # Check status
```

### Belief Pipeline
```bash
# Check unprocessed thinking
node belief-processor.js unprocessed

# Process thinking into beliefs
node belief-processor.js process

# View belief summary
node belief-processor.js summary

# Check pending identity moments
node scar-processor.js pending

# View active warmth/wisdom
node scar-processor.js scars
```

## Configuration

### LM Studio
- Default endpoint: `http://localhost:1234/v1/chat/completions`
- Recommended models: deepseek-r1-distill-qwen-14b, llama-3.1-8b, mistral-7b
- Models with `<think>` tag support work best for identity capture

### IPC
- Protocol: TCP on `localhost:19700`
- Allows communication between SYSTEM service and user widget

## Database Schema

Key tables in `data/nia.db`:

```sql
thinking_log      -- Captured <think> content from conversations
beliefs           -- Extracted beliefs with conviction scores
identity_scars    -- Permanent formative moments (warmth/wisdom)
scar_candidates   -- Pending moments awaiting approval
scar_effects      -- Behavioral effects from scars
cognitive_load    -- Daily mental budget tracking
```

## Widget UI

The identity bar shows:
- 💭 **Beliefs** - Total active beliefs
- ✨ **Warmth** - Positive formative moments
- 📖 **Wisdom** - Growth/learning moments
- 🟢 **Status** - Cognitive load (Normal/Tired/Exhausted)

Click the bar to expand and see details.

## Development

### Tech Stack
- **Runtime**: Node.js
- **Desktop UI**: Electron
- **Database**: SQLite (better-sqlite3)
- **Service**: node-windows
- **IPC**: TCP sockets
- **LLM**: LM Studio (local)

### Key Files to Modify
- `daemon.js` - System prompt, chat handling, belief integration
- `belief-processor.js` - Belief extraction logic
- `widget-chat.html` - UI styling and layout

## Troubleshooting

### Widget shows "Offline"
```bash
# Check service status
sc query niaservice.exe

# Check logs
type "data\logs\daemon.log"

# Restart service
sc stop niaservice.exe
sc start niaservice.exe
```

### No beliefs forming
```bash
# Check if thinking is being captured
node belief-processor.js unprocessed

# Manually trigger processing
node belief-processor.js process
```

### LM Studio connection issues
- Ensure LM Studio is running
- Verify model is loaded
- Check endpoint: `http://localhost:1234/v1/chat/completions`

## Roadmap

### Phase 2 Remaining
- [ ] Personality tuning (reduce over-eagerness)
- [ ] Temporal awareness (time of day, session gaps)

### Phase 3: Memory
- [ ] Conversation summaries saved to DB
- [ ] Semantic search with embeddings
- [ ] "Remember when..." actually works

### Phase 4: Observation
- [ ] Screen awareness
- [ ] Process monitoring
- [ ] Proactive engagement

### Phase 5: Plugins
- [ ] Self-modification framework
- [ ] Code reading capabilities
- [ ] Autonomous experimentation

## Design Philosophy

- **Emergent Identity**: Personality develops through experience, not pre-programming
- **Blank Slate Personhood**: NIA knows facts about herself, but forms opinions authentically
- **Warmth & Wisdom**: Both beautiful and difficult moments shape who she becomes
- **Local First**: 100% local execution, no external API dependencies
- **Narrative Continuity**: Changes preserve sense of self

## License

Private project - All rights reserved

## Acknowledgments

Built in collaboration with Claude (Anthropic) using iterative development.
