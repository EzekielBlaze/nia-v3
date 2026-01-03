#!/usr/bin/env node
/**
 * DEBUG EXTRACTION - See what the LLM actually returns
 * 
 * This script shows the raw LLM output to help debug JSON parsing issues
 */

const Database = require('better-sqlite3');
const path = require('path');
const { BELIEF_EXTRACTION_SYSTEM_PROMPT, generateExtractionPrompt } = require('./belief-extraction-prompt');

const DB_PATH = path.join(__dirname, 'data', 'nia.db');
const LLM_ENDPOINT = 'http://localhost:1234/v1/chat/completions';

async function debugExtraction() {
  console.log('🔍 DEBUG: Testing LLM extraction\n');
  
  // Get one unprocessed thinking log entry
  const db = new Database(DB_PATH);
  const entry = db.prepare(`
    SELECT id, user_message, thinking_content, response_summary
    FROM thinking_log
    WHERE processed_for_beliefs = 0
    LIMIT 1
  `).get();
  
  if (!entry) {
    console.log('❌ No unprocessed thinking log entries found');
    console.log('\nCreate a test entry with:');
    console.log('  sqlite3 data\\nia.db');
    console.log('  INSERT INTO thinking_log (user_message, thinking_content, response_summary, processed_for_beliefs)');
    console.log('  VALUES (\'I love programming in Rust\', \'User values type safety\', \'That makes sense!\', 0);');
    db.close();
    return;
  }
  
  console.log('📝 Found thinking log entry:');
  console.log(`  ID: ${entry.id}`);
  console.log(`  User message: "${entry.user_message.substring(0, 60)}..."`);
  console.log('');
  
  // Build the prompt
  const messages = [
    {
      role: 'system',
      content: BELIEF_EXTRACTION_SYSTEM_PROMPT
    },
    {
      role: 'user',
      content: generateExtractionPrompt({
        userMessage: entry.user_message,
        assistantResponse: entry.response_summary,
        thinking: entry.thinking_content
      })
    }
  ];
  
  console.log('🤖 Calling LLM...\n');
  
  try {
    const response = await fetch(LLM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'local-model',
        messages: messages,
        temperature: 0.3,
        max_tokens: 2000
      })
    });
    
    if (!response.ok) {
      console.error(`❌ LLM API error: ${response.status}`);
      console.error('Is LM Studio running?');
      db.close();
      return;
    }
    
    const data = await response.json();
    const rawOutput = data.choices[0].message.content;
    
    console.log('='*80);
    console.log('RAW LLM OUTPUT:');
    console.log('='*80);
    console.log(rawOutput);
    console.log('='*80);
    console.log('');
    
    // Try to parse it
    console.log('🔧 Attempting to parse...\n');
    
    let cleaned = rawOutput.trim();
    
    // Remove markdown code fences
    cleaned = cleaned.replace(/^```json\n?/gi, '');
    cleaned = cleaned.replace(/^```\n?/gi, '');
    cleaned = cleaned.replace(/\n?```$/gi, '');
    cleaned = cleaned.trim();
    
    // Try to extract JSON
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    console.log('CLEANED OUTPUT (what we\'ll try to parse):');
    console.log('-'*80);
    console.log(cleaned.substring(0, 500));
    if (cleaned.length > 500) {
      console.log('... (truncated)');
    }
    console.log('-'*80);
    console.log('');
    
    try {
      const parsed = JSON.parse(cleaned);
      console.log('✅ JSON parsed successfully!\n');
      console.log('Structure:');
      console.log(`  Has candidates: ${!!parsed.candidates}`);
      console.log(`  Candidate count: ${parsed.candidates?.length || 0}`);
      
      if (parsed.candidates && parsed.candidates.length > 0) {
        console.log('\nFirst candidate:');
        console.log(JSON.stringify(parsed.candidates[0], null, 2));
      }
      
    } catch (parseErr) {
      console.error('❌ JSON parsing failed:');
      console.error(`  Error: ${parseErr.message}`);
      console.error('\nThe LLM is not returning valid JSON.');
      console.error('This usually means:');
      console.error('  1. The model doesn\'t follow instructions well');
      console.error('  2. The prompt needs adjustment');
      console.error('  3. The model is too small or not instruction-tuned');
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    db.close();
  }
}

debugExtraction().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
