const path = require("path");
const fs = require("fs");
const logger = require("./logger");

/**
 * NIA V3 - Configuration System
 * 
 * Centralized configuration management with:
 * - Default settings
 * - User overrides (from config file)
 * - Path management
 * - Environment detection
 */

class Config {
  constructor() {
    // Detect base directory (where the app is running from)
    this.BASE_DIR = process.cwd();
    
    // Data directory (where all NIA data lives)
    // Default to a 'data' folder in the base directory
    this.DATA_DIR = path.join(this.BASE_DIR, "data");
    
    // Load user config if it exists
    this.userConfig = this._loadUserConfig();
    
    // Apply user overrides to data directory if specified
    if (this.userConfig.data_directory) {
      this.DATA_DIR = this.userConfig.data_directory;
    }
    
    // Ensure data directory exists
    this._ensureDir(this.DATA_DIR);
    
    logger.info(`Config initialized: Base=${this.BASE_DIR}, Data=${this.DATA_DIR}`);
  }
  
  /**
   * Load user configuration from config.json (if exists)
   */
  _loadUserConfig() {
    const configPath = path.join(this.BASE_DIR, "config.json");
    
    if (fs.existsSync(configPath)) {
      try {
        const data = fs.readFileSync(configPath, "utf8");
        const config = JSON.parse(data);
        logger.info(`User config loaded from ${configPath}`);
        return config;
      } catch (err) {
        logger.warn(`Failed to load config.json: ${err.message}`);
        return {};
      }
    }
    
    return {};
  }
  
  /**
   * Ensure a directory exists (create if needed)
   */
  _ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created directory: ${dir}`);
    }
  }
  
  /**
   * Get a config value with fallback to default
   */
  get(key, defaultValue) {
    return this.userConfig[key] !== undefined ? this.userConfig[key] : defaultValue;
  }
  
  /**
   * Get all configuration as an object
   */
  getAll() {
    return {
      // Base paths
      base_directory: this.BASE_DIR,
      data_directory: this.DATA_DIR,
      
      // Service settings
      service_name: this.get("service_name", "NiaService"),
      service_display_name: this.get("service_display_name", "NIA V3 Daemon"),
      service_description: this.get("service_description", "NIA V3 - AI Companion Background Service"),
      
      // IPC settings
      ipc_socket_name: this.get("ipc_socket_name", "nia-v3-ipc"),
      ipc_port: this.get("ipc_port", 41234), // TCP port for Windows compatibility
      ipc_retry_attempts: this.get("ipc_retry_attempts", 5),
      ipc_retry_delay: this.get("ipc_retry_delay", 1000), // ms
      
      // Logging settings
      log_level: this.get("log_level", "INFO"),
      log_retention_days: this.get("log_retention_days", 30),
      
      // LM Studio connection
      lm_studio_url: this.get("lm_studio_url", "http://127.0.0.1:1234"),
      lm_studio_model: this.get("lm_studio_model", "auto"), // "auto" = use whatever is loaded
      
      // Memory settings
      memory_cache_size: this.get("memory_cache_size", 1000),
      memory_embedding_model: this.get("memory_embedding_model", "all-MiniLM-L6-v2"),
      
      // Observation settings (for future use)
      observation_enabled: this.get("observation_enabled", false),
      observation_interval_seconds: this.get("observation_interval_seconds", 30),
      
      // Auto-start settings
      auto_start_enabled: this.get("auto_start_enabled", true),
      
      // Development mode
      dev_mode: this.get("dev_mode", false)
    };
  }
  
  /**
   * Get file paths for all data files
   */
  getPaths() {
    const dataDir = this.DATA_DIR;
    
    return {
      // Directories
      logs: path.join(dataDir, "logs"),
      memories: path.join(dataDir, "memories"),
      backups: path.join(dataDir, "backups"),
      thoughts: path.join(dataDir, "thoughts"),
      sessions: path.join(dataDir, "sessions"),
      
      // Database files
      main_db: path.join(dataDir, "nia.db"),
      session_db: path.join(dataDir, "sessions.db"),
      
      // JSON data files
      heart: path.join(dataDir, "heart.json"),
      config: path.join(dataDir, "config.json"),
      proposals: path.join(dataDir, "proposals.json"),
      reflections: path.join(dataDir, "reflections.json"),
      
      // Embedding database
      vector_db: path.join(dataDir, "memories", "vectors")
    };
  }
  
  /**
   * Initialize all required directories
   */
  initializeDirectories() {
    const paths = this.getPaths();
    
    // Create all directories
    const dirs = [
      paths.logs,
      paths.memories,
      paths.backups,
      paths.thoughts,
      paths.sessions,
      path.dirname(paths.vector_db) // Parent of vector_db
    ];
    
    dirs.forEach(dir => this._ensureDir(dir));
    
    logger.info("All data directories initialized");
  }
  
  /**
   * Save current configuration to config.json
   */
  save() {
    const configPath = path.join(this.BASE_DIR, "config.json");
    const data = JSON.stringify(this.getAll(), null, 2);
    
    try {
      fs.writeFileSync(configPath, data, "utf8");
      logger.info(`Configuration saved to ${configPath}`);
      return true;
    } catch (err) {
      logger.error(`Failed to save config: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Update a configuration value
   */
  set(key, value) {
    this.userConfig[key] = value;
    logger.info(`Config updated: ${key} = ${value}`);
  }
  
  /**
   * Validate configuration
   */
  validate() {
    const errors = [];
    
    // Check if LM Studio URL is valid
    const lmUrl = this.get("lm_studio_url", "");
    if (lmUrl && !lmUrl.startsWith("http")) {
      errors.push("lm_studio_url must start with http:// or https://");
    }
    
    // Check if data directory is accessible
    try {
      fs.accessSync(this.DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
    } catch (err) {
      errors.push(`Data directory not accessible: ${this.DATA_DIR}`);
    }
    
    if (errors.length > 0) {
      logger.warn(`Config validation found ${errors.length} issue(s):`);
      errors.forEach(err => logger.warn(`  - ${err}`));
      return false;
    }
    
    logger.info("Configuration validated successfully");
    return true;
  }
}

// Create singleton instance
const config = new Config();

// Export both the instance and the class
module.exports = config;
module.exports.Config = Config;
