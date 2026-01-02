#!/usr/bin/env node
/**
 * NIA Identity Query Layer - Test Suite
 * Tests all query functions against a fresh database with example data
 */

const IdentityQuery = require('./identity-query');
const fs = require('fs');
const path = require('path');

// Colors for terminal output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let passed = 0;
let failed = 0;

function test(name, condition, details = '') {
  if (condition) {
    console.log(`${GREEN}✓${RESET} ${name}`);
    passed++;
  } else {
    console.log(`${RED}✗${RESET} ${name}`);
    if (details) console.log(`  ${RED}${details}${RESET}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n${CYAN}${BOLD}=== ${name} ===${RESET}\n`);
}

function runTests() {
  console.log(`${BOLD}NIA Identity Query Layer - Test Suite${RESET}`);
  console.log('='.repeat(50));

  // Check if schema exists
  const schemaPath = process.argv[2] || path.join(__dirname, '..', 'identity', 'identity-schema-v3.sql');
  if (!fs.existsSync(schemaPath)) {
    console.log(`${RED}Schema not found: ${schemaPath}${RESET}`);
    console.log('Usage: node test-query.js [path-to-schema.sql]');
    process.exit(1);
  }

  section('Database Initialization');
  
  let iq;
  const testDbPath = path.join(__dirname, 'test-identity.db');
  
  try {
    // Remove old test db if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    iq = new IdentityQuery();
    iq.initFromSchema(testDbPath, schemaPath);
    test('Schema loaded successfully', true);
    test('IdentityQuery initialized', iq.ready);
  } catch (e) {
    test('Database initialization', false, e.message);
    console.error(e.stack);
    process.exit(1);
  }

  section('Core Anchors');
  
  const anchors = iq.getCoreAnchors();
  test('getCoreAnchors returns results', anchors.length > 0);
  test('Bootstrap anchor exists', anchors.some(a => 
    a.anchor_statement.includes('genuinely helpful')
  ));
  test('Bootstrap anchor is locked', anchors[0]?.is_locked === 1);
  test('Bootstrap anchor has stability 100', anchors[0]?.stability_score === 100);

  section('Formative Scars');
  
  const scars = iq.getFormativeScars();
  test('getFormativeScars returns results', scars.length >= 2);
  
  const negativeScar = scars.find(s => s.emotional_valence < 0);
  const positiveScar = scars.find(s => s.emotional_valence > 0);
  
  test('Negative scar exists (helpfulness suspicion)', negativeScar !== undefined);
  test('Positive scar exists (genuine connection)', positiveScar !== undefined);
  test('Negative scar has correct category', negativeScar?.scar_category === 'NEGATIVE');
  test('Positive scar has correct category', positiveScar?.scar_category === 'POSITIVE');

  section('Scar Effects');
  
  const allEffects = iq.getScarEffects();
  test('getScarEffects returns results', allEffects.length >= 4);
  
  const helpfulnessEffects = iq.getScarEffects('helpfulness');
  test('Can filter effects by domain', helpfulnessEffects.length >= 2);
  
  const hardBlocks = iq.getHardBlocks();
  test('getHardBlocks returns results', hardBlocks.length >= 1);
  test('Hard block targets instant_high_impact_help', 
    hardBlocks.some(b => b.target_action === 'instant_high_impact_help'));
  
  const caps = iq.getCapabilityCaps();
  test('getCapabilityCaps returns results', caps.length >= 2);
  test('Helpfulness confidence cap exists', 
    caps.some(c => c.target_action === 'helpfulness_confidence'));
  test('Emotional capacity floor exists',
    caps.some(c => c.target_domain === 'emotional_capacity'));
  
  const requiredSteps = iq.getRequiredSteps();
  test('getRequiredSteps returns results', requiredSteps.length >= 1);
  test('Motive check step exists',
    requiredSteps.some(s => s.required_step.includes('why am I helping')));
  
  const biases = iq.getBiases();
  test('getBiases returns results', biases.length >= 2);

  section('Cognitive Load');
  
  const cogLoad = iq.getCognitiveLoad();
  test('getCognitiveLoad returns result', cogLoad !== null);
  test('Has revision budget', cogLoad.revision_budget_max === 100);
  test('Not overwhelmed initially', cogLoad.is_overwhelmed === 0);
  test('Can process beliefs', cogLoad.can_process_new_beliefs === 1);

  section('Distress State');
  
  const distress = iq.getCurrentDistress();
  test('getCurrentDistress returns (possibly empty)', Array.isArray(distress));
  
  const defensiveMode = iq.getActiveDefensiveMode();
  test('getActiveDefensiveMode works', defensiveMode === null || typeof defensiveMode === 'object');

  section('Tensions');
  
  const tensions = iq.getActiveTensions();
  test('getActiveTensions returns (possibly empty)', Array.isArray(tensions));
  
  const refusalTriggers = iq.getRefusalTriggers();
  test('getRefusalTriggers returns (possibly empty)', Array.isArray(refusalTriggers));

  section('Belief Echoes');
  
  const echoes = iq.getActiveEchoes();
  test('getActiveEchoes returns (possibly empty)', Array.isArray(echoes));

  section('Main Decision Function: canPerformAction');
  
  // Test blocked action
  const blockedResult = iq.canPerformAction('helpfulness', 'instant_high_impact_help');
  test('Instant high impact help is BLOCKED', blockedResult.blocked === true);
  test('Block has reason', blockedResult.blockReason !== null);
  console.log(`  ${YELLOW}Reason: ${blockedResult.blockReason}${RESET}`);
  
  // Test allowed action with requirements
  const helpResult = iq.canPerformAction('helpfulness', 'provide_help');
  test('General help is ALLOWED', helpResult.allowed === true);
  test('But has requirements', helpResult.requirements.length > 0);
  console.log(`  ${YELLOW}Requirement: ${helpResult.requirements[0]?.step}${RESET}`);
  
  // Test action with caps
  const trustResult = iq.canPerformAction('self_trust', 'evaluate');
  test('Self trust action is ALLOWED', trustResult.allowed === true);
  test('Has caps to respect', trustResult.caps.length > 0);
  
  // Test unrelated domain
  const otherResult = iq.canPerformAction('random', 'action');
  test('Unrelated action is ALLOWED', otherResult.allowed === true);
  test('No special requirements', otherResult.requirements.length === 0);

  section('Identity Context Building');
  
  const context = iq.buildIdentityContext();
  test('buildIdentityContext returns all sections', 
    context.coreAnchors && context.formativeScars && context.activeEffects);
  test('Context has core anchors', context.coreAnchors.length > 0);
  test('Context has scars', context.formativeScars.length >= 2);
  
  const systemPrompt = iq.formatForSystemPrompt();
  test('formatForSystemPrompt returns string', typeof systemPrompt === 'string');
  test('System prompt mentions core principles', systemPrompt.includes('Core Principles'));
  test('System prompt mentions formative experiences', systemPrompt.includes('Formative Experiences'));
  test('System prompt mentions constraints', systemPrompt.includes('CANNOT') || systemPrompt.includes('MUST'));

  console.log(`\n${CYAN}Sample System Prompt Output:${RESET}`);
  console.log('-'.repeat(50));
  console.log(systemPrompt.substring(0, 1500) + '...');
  console.log('-'.repeat(50));

  section('Cleanup');
  
  iq.close();
  test('Database closed', !iq.ready);
  
  // Clean up temp file
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${BOLD}Results: ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : ''}${failed} failed${RESET}`);
  
  if (failed === 0) {
    console.log(`\n${GREEN}${BOLD}All tests passed! ✓${RESET}`);
  } else {
    console.log(`\n${RED}${BOLD}Some tests failed.${RESET}`);
    process.exit(1);
  }
}

runTests();
