/**
 * TIME FORMATTER
 * Converts timestamps to human-readable relative times
 * ~75 lines (Target: <80)
 */

class TimeFormatter {
  /**
   * Convert timestamp to "3 days ago" style string
   */
  static relativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    
    if (seconds < 10) return 'just now';
    if (seconds < 60) return 'moments ago';
    if (minutes === 1) return 'a minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;
    if (hours === 1) return 'an hour ago';
    if (hours < 24) return `${hours} hours ago`;
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (weeks === 1) return 'a week ago';
    if (weeks < 4) return `${weeks} weeks ago`;
    if (months === 1) return 'a month ago';
    if (months < 12) return `${months} months ago`;
    if (years === 1) return 'a year ago';
    return `${years} years ago`;
  }
  
  /**
   * Get date bucket (YYYY-MM-DD)
   */
  static dateBucket(timestamp = Date.now()) {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0];
  }
  
  /**
   * Get time of day (morning/afternoon/evening/night)
   */
  static timeOfDay(timestamp = Date.now()) {
    const hour = new Date(timestamp).getHours();
    
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }
  
  /**
   * Get day of week
   */
  static dayOfWeek(timestamp = Date.now()) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date(timestamp).getDay()];
  }
  
  /**
   * Format milliseconds to readable duration
   */
  static formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

module.exports = TimeFormatter;
