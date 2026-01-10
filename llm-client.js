/**
 * LLM CLIENT - Local/Cloud Toggle
 * 
 * Reads from .env file:
 *   LLM_MODE=local|cloud
 *   CLOUD_LLM_API_KEY=gsk_xxxxx
 *   CLOUD_LLM_MODEL=llama-3.3-70b-versatile
 * 
 * Usage:
 *   const llm = require('./llm-client');
 *   const response = await llm.chat(systemPrompt, messages);
 *   llm.setMode('cloud'); // switch on the fly
 */

const path = require('path');

// Load .env file
function loadEnv() {
  try {
    const fs = require('fs');
    const envPath = path.join(__dirname, '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('='); // Handle values with = in them
        if (key && value) {
          process.env[key.trim()] = value.trim();
        }
      }
    });
    console.log('✅ Loaded .env file');
  } catch (err) {
    console.log('⚠️ No .env file found, using defaults');
  }
}

loadEnv();

// Configuration
const CONFIG = {
  // Local (LM Studio)
  local: {
    endpoint: process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:1234/v1/chat/completions',
    model: process.env.LOCAL_LLM_MODEL || 'local-model',
    apiKey: null, // No auth needed
  },
  
  // Cloud (Groq)
  cloud: {
    endpoint: process.env.CLOUD_LLM_ENDPOINT || 'https://api.groq.com/openai/v1/chat/completions',
    model: process.env.CLOUD_LLM_MODEL || 'llama-3.3-70b-versatile',
    apiKey: process.env.CLOUD_LLM_API_KEY || null,
  }
};

// Current mode
let currentMode = process.env.LLM_MODE || 'local';

/**
 * Get current mode
 */
function getMode() {
  return currentMode;
}

/**
 * Set mode (local or cloud)
 */
function setMode(mode) {
  if (mode !== 'local' && mode !== 'cloud') {
    throw new Error(`Invalid mode: ${mode}. Use 'local' or 'cloud'`);
  }
  
  if (mode === 'cloud' && !CONFIG.cloud.apiKey) {
    throw new Error('Cannot switch to cloud mode: CLOUD_LLM_API_KEY not set in .env');
  }
  
  const oldMode = currentMode;
  currentMode = mode;
  console.log(`🔀 LLM mode: ${oldMode} → ${currentMode}`);
  
  return currentMode;
}

/**
 * Toggle between modes
 */
function toggleMode() {
  return setMode(currentMode === 'local' ? 'cloud' : 'local');
}

/**
 * Get current config
 */
function getConfig() {
  return CONFIG[currentMode];
}

/**
 * Check if cloud is available
 */
function isCloudAvailable() {
  return !!CONFIG.cloud.apiKey;
}

/**
 * Main chat function
 */
async function chat(systemPrompt, messages, options = {}) {
  const config = CONFIG[currentMode];
  const fetch = require('node-fetch');
  
  const {
    temperature = 0.7,
    maxTokens = 2048,
    timeout = 120000,
  } = options;
  
  // Build headers
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }
  
  // Build request
  const requestBody = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
  
  const startTime = Date.now();
  
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    const elapsed = Date.now() - startTime;
    
    // Log performance
    const modeEmoji = currentMode === 'cloud' ? '☁️' : '🏠';
    console.log(`${modeEmoji} LLM (${currentMode}): ${elapsed}ms`);
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    } else {
      throw new Error('Invalid LLM response format');
    }
    
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`❌ LLM call failed (${currentMode}): ${err.message}`);
    throw err;
  }
}

/**
 * Quick chat (for short responses like pre-flight checks)
 */
async function quickChat(prompt, options = {}) {
  return chat('You are a helpful assistant. Be brief.', [
    { role: 'user', content: prompt }
  ], {
    temperature: 0.3,
    maxTokens: 100,
    timeout: 30000,
    ...options
  });
}

/**
 * Get status info
 */
function getStatus() {
  return {
    mode: currentMode,
    config: {
      endpoint: CONFIG[currentMode].endpoint,
      model: CONFIG[currentMode].model,
      hasApiKey: !!CONFIG[currentMode].apiKey,
    },
    cloudAvailable: isCloudAvailable(),
  };
}

module.exports = {
  chat,
  quickChat,
  getMode,
  setMode,
  toggleMode,
  getConfig,
  getStatus,
  isCloudAvailable,
  CONFIG,
};
