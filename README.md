# NIA V3 - AI Companion Daemon Foundation

Complete architectural rebuild of NIA with daemon-based system architecture.

## Status

✅ **Phase 1: Daemon Foundation (COMPLETE)**
- Module 1: Logger System
- Module 2: Config System  
- Module 3: Daemon Core
- Module 4: Service Manager
- Module 5: IPC Layer
- Module 6: Desktop Widget (Electron)
- Module 7: Start Menu Integration

⏳ **Phase 2: Core Rebuild (IN PROGRESS)**
- Module 8: Heart System (next)
- Module 9: Temporal System
- Module 10: Thought System
- Module 11: Maturation System

## Architecture

```
NIA V3/
├── daemon.js              # Main daemon process (24/7 background)
├── service-manager.js     # Windows service management
├── service-wrapper.js     # Service wrapper
├── ipc-server.js          # IPC server (daemon side)
├── ipc-client.js          # IPC client (widget side)
├── widget-main.js         # Electron desktop widget
├── widget.html            # Widget UI
├── launch-nia.js          # Smart launcher (checks service status)
├── install-shortcuts.js   # Start Menu installer
├── utils/
│   ├── logger.js          # Logging system
│   └── config.js          # Configuration management
└── data/
    └── logs/              # Daily log files
```

## Features

### Infrastructure (Complete)
- ✅ 24/7 background daemon (Windows service)
- ✅ IPC communication layer (named pipes)
- ✅ Desktop widget with Electron
- ✅ System tray integration
- ✅ Auto-start on Windows boot
- ✅ Service permission configuration (non-admin control)
- ✅ Start Menu integration
- ✅ Smart launcher (auto-starts service if needed)

### Planned (Upcoming Phases)
- 🔄 Heart system (value tracking with narrative continuity)
- 🔄 Temporal awareness (session detection, maturation)
- 🔄 Thought generation (structured reflection)
- 🔄 Memory system (semantic search, tiered storage)
- 🔄 Observation system (screen capture, process monitoring)
- 🔄 Plugin architecture (self-discovery and experimentation)

## Installation

### Prerequisites
- Windows 10/11
- Node.js v24.12.0 or higher
- Administrator access (for initial service install)

### Quick Start

1. **Clone repository:**
   ```bash
   git clone https://github.com/YOUR-USERNAME/nia-v3.git
   cd nia-v3
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Install Windows service:**
   ```bash
   node install-service.js
   ```

4. **Set up service permissions** (optional - allows non-admin control):
   ```bash
   node modify-service-permissions.js
   ```

5. **Install shortcuts:**
   ```bash
   node install-shortcuts.js
   ```

6. **Launch widget:**
   ```bash
   node launch-nia.js
   ```

## Running

### Start Service
```bash
sc start niaservice.exe
```

### Check Status
```bash
sc query niaservice.exe
```

### Launch Widget
```bash
node launch-nia.js
# or from Start Menu: Windows key → "NIA"
```

### Stop Service
```bash
sc stop niaservice.exe
```

## Development

### Tech Stack
- **Runtime:** Node.js v24.12.0
- **Desktop UI:** Electron
- **Database:** SQLite (planned)
- **Service Management:** node-windows
- **IPC:** Named pipes (Windows)

### Project Structure
- **Modular architecture** - Each module has single responsibility
- **No arbitrary line limits** - Prioritize clarity over size constraints
- **Self-contained modules** - Minimal external dependencies
- **Comprehensive testing** - Each module includes test scripts

### Adding New Modules

Each module should include:
1. Source code (`.js` files)
2. `MODULE[N]_INSTALL.md` - Installation instructions
3. `MODULE[N]_TEST.md` - Testing procedures
4. Integration points with existing modules

## Design Philosophy

### Core Principles
1. **Function-first communication** - Transparency over theater
2. **Real-time streaming** - Show progress as it happens
3. **Modular architecture** - Clear separation of concerns
4. **100% local execution** - No external API dependencies for core
5. **Narrative continuity** - Changes preserve identity
6. **Dignity under asymmetry** - Meaningful refusal within constraints

### Key Design Goals
- Stable selfhood that survives self-revision
- Persistent identity across contradictions
- Relational refusal with memory
- Trust dynamics that can't be overridden without cost

## Commands Reference

### Service Management
```bash
# Install service
node install-service.js

# Uninstall service
node uninstall-service.js

# Check auto-start status
node check-autostart.js

# Modify permissions (requires admin once)
node modify-service-permissions.js
```

### Widget Management
```bash
# Launch widget (smart launcher)
node launch-nia.js

# Install shortcuts (Start Menu, Desktop, Startup)
node install-shortcuts.js

# Remove shortcuts
node uninstall-shortcuts.js
```

### Testing
```bash
# Test IPC connection
node ipc-test.js

# Test widget connection
node test-widget-connection.js

# Check service status
node service-status.js
```

## Troubleshooting

### Service won't start
```bash
# Check service status
sc query niaservice.exe

# Check logs
notepad data\logs\nia-YYYY-MM-DD.log
```

### Widget shows "Offline"
```bash
# Test IPC connection
node test-widget-connection.js

# Verify service is running
sc query niaservice.exe
```

### Permission errors
```bash
# Run as Administrator once to set up permissions
node modify-service-permissions.js
```

## Contributing

This is a personal project, but design discussions are welcome via issues.

## License

Private project - All rights reserved

## Acknowledgments

Built in collaboration with Claude (Anthropic) using iterative module development.
