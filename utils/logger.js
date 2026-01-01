const fs = require("fs");
const path = require("path");

/**
 * NIA V3 - Logger Utility
 * 
 * Simple, reliable logging to console + file with timestamps and levels.
 * Used by all other modules.
 */

class Logger {
  constructor(logDir = null) {
    // Default to logs directory in current working directory
    this.logDir = logDir || path.join(process.cwd(), "logs");
    
    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // Log file path with date
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    this.logFile = path.join(this.logDir, `nia-${date}.log`);
    
    // Log levels
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    };
    
    // Current log level (can be changed)
    this.currentLevel = this.levels.INFO;
  }
  
  /**
   * Format log message with timestamp and level
   */
  _format(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }
  
  /**
   * Write to both console and file
   */
  _write(level, message, consoleMethod = "log") {
    const formatted = this._format(level, message);
    
    // Write to console
    console[consoleMethod](formatted);
    
    // Write to file (append)
    try {
      fs.appendFileSync(this.logFile, formatted + "\n", "utf8");
    } catch (err) {
      console.error(`Failed to write to log file: ${err.message}`);
    }
  }
  
  /**
   * Log at DEBUG level
   */
  debug(message) {
    if (this.currentLevel <= this.levels.DEBUG) {
      this._write("DEBUG", message, "log");
    }
  }
  
  /**
   * Log at INFO level
   */
  info(message) {
    if (this.currentLevel <= this.levels.INFO) {
      this._write("INFO", message, "log");
    }
  }
  
  /**
   * Log at WARN level
   */
  warn(message) {
    if (this.currentLevel <= this.levels.WARN) {
      this._write("WARN", message, "warn");
    }
  }
  
  /**
   * Log at ERROR level
   */
  error(message) {
    if (this.currentLevel <= this.levels.ERROR) {
      this._write("ERROR", message, "error");
    }
  }
  
  /**
   * Set log level
   */
  setLevel(level) {
    const levelName = level.toUpperCase();
    if (this.levels[levelName] !== undefined) {
      this.currentLevel = this.levels[levelName];
      this.info(`Log level set to ${levelName}`);
    } else {
      this.warn(`Invalid log level: ${level}`);
    }
  }
  
  /**
   * Get current log file path
   */
  getLogFile() {
    return this.logFile;
  }
}

// Create singleton instance
const logger = new Logger();

// Export both the instance and the class
module.exports = logger;
module.exports.Logger = Logger;
