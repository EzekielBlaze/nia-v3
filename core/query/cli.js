#!/usr/bin/env node
/**
 * NIA Identity CLI
 * Command-line tool for inspecting and managing NIA's identity state
 * 
 * Usage:
 *   node cli.js <database> <command> [options]
 * 
 * Commands:
 *   status          - Show overall identity status
 *   anchors         - List core identity anchors
 *   beliefs         - List active beliefs
 *   scars           - List formative scars
 *   effects         - List active scar effects
 *   tensions        - List unresolved tensions
 *   distress        - Show current distress state
 *   load            - Show cognitive load status
 *   check <d> <a>   - Check if action is allowed (domain, action)
 *   context         - Show full identity context for LLM
 *   prompt          - Generate system prompt injection
 */

const IdentityQuery = require('./identity-query');
const fs = require('fs');
const path = require('path');

// Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function printHeader(text) {
  console.log(`\n${CYAN}${BOLD}═══ ${text} ═══${RESET}\n`);
}

function printSubHeader(text) {
  console.log(`${YELLOW}▸ ${text}${RESET}`);
}

function printItem(label, value, indent = 0) {
  const spaces = '  '.repeat(indent);
  console.log(`${spaces}${DIM}${label}:${RESET} ${value}`);
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`${BOLD}NIA Identity CLI${RESET}`);
    console.log(`\nUsage: node cli.js <database> <command> [options]\n`);
    console.log('Commands:');
    console.log('  status          Show overall identity status');
    console.log('  anchors         List core identity anchors');
    console.log('  beliefs         List active beliefs');
    console.log('  scars           List formative scars');
    console.log('  effects         List active scar effects');
    console.log('  tensions        List unresolved tensions');
    console.log('  distress        Show current distress state');
    console.log('  load            Show cognitive load status');
    console.log('  check <d> <a>   Check if action is allowed');
    console.log('  context         Show full identity context');
    console.log('  prompt          Generate system prompt injection');
    process.exit(1);
  }

  const dbPath = args[0];
  const command = args[1];

  if (!fs.existsSync(dbPath)) {
    console.error(`${RED}Database not found: ${dbPath}${RESET}`);
    process.exit(1);
  }

  const iq = new IdentityQuery();
  iq.init(dbPath);

  switch (command) {
    case 'status': {
      printHeader('NIA IDENTITY STATUS');
      
      const anchors = iq.getCoreAnchors();
      const scars = iq.getFormativeScars();
      const tensions = iq.getActiveTensions();
      const distress = iq.getCurrentDistress();
      const load = iq.getCognitiveLoad();
      const beliefs = iq.getActiveBeliefs(30);
      
      printSubHeader('Overview');
      printItem('Core Anchors', anchors.length);
      printItem('Active Beliefs', beliefs.length);
      printItem('Formative Scars', `${scars.length} (${scars.filter(s => s.emotional_valence > 0).length} positive, ${scars.filter(s => s.emotional_valence < 0).length} negative)`);
      printItem('Active Tensions', tensions.length);
      printItem('Active Distress', distress.length);
      
      console.log();
      printSubHeader('Cognitive State');
      printItem('Fatigue Level', load.fatigue_level);
      printItem('Budget Remaining', `${load.revision_budget_remaining}/${load.revision_budget_max}`);
      printItem('Can Process Beliefs', load.can_process_new_beliefs ? '✓' : '✗');
      printItem('Can Engage Complex', load.can_engage_complex_topics ? '✓' : '✗');
      
      if (distress.length > 0) {
        console.log();
        printSubHeader('Active Distress');
        for (const d of distress) {
          console.log(`  ${RED}⚠${RESET} ${d.severity_category} - ${d.trigger_type}`);
          if (d.defensive_mode) {
            console.log(`    Defensive mode: ${d.defensive_mode}`);
          }
        }
      }
      
      const defensiveMode = iq.getActiveDefensiveMode();
      if (defensiveMode) {
        console.log();
        printSubHeader(`Defensive Mode Active: ${defensiveMode.mode.toUpperCase()}`);
      }
      break;
    }

    case 'anchors': {
      printHeader('CORE IDENTITY ANCHORS');
      const anchors = iq.getCoreAnchors();
      
      for (const anchor of anchors) {
        console.log(`${anchor.is_locked ? '🔒' : '○'} ${BOLD}${anchor.anchor_statement}${RESET}`);
        printItem('Type', anchor.anchor_type, 1);
        printItem('Stability', `${anchor.stability_score}%`, 1);
        if (anchor.constitutional_rule) {
          printItem('Rule', anchor.constitutional_rule, 1);
        }
        console.log();
      }
      break;
    }

    case 'beliefs': {
      printHeader('ACTIVE BELIEFS');
      const minConviction = parseInt(args[2]) || 30;
      const beliefs = iq.getActiveBeliefs(minConviction);
      
      console.log(`${DIM}(showing beliefs with conviction ≥ ${minConviction})${RESET}\n`);
      
      for (const belief of beliefs) {
        const bar = '█'.repeat(Math.floor(belief.conviction_score / 10)) + 
                    '░'.repeat(10 - Math.floor(belief.conviction_score / 10));
        console.log(`${bar} ${belief.conviction_score.toFixed(0)}% ${belief.belief_statement}`);
        printItem('Type', belief.belief_type, 1);
        if (belief.derives_from_anchor) {
          printItem('Anchor', belief.derives_from_anchor.substring(0, 50) + '...', 1);
        }
        console.log();
      }
      break;
    }

    case 'scars': {
      printHeader('FORMATIVE SCARS');
      const scars = iq.getFormativeScars();
      
      for (const scar of scars) {
        const icon = scar.emotional_valence > 0.3 ? '✨' : 
                     scar.emotional_valence < -0.3 ? '⚡' : '◐';
        const category = scar.scar_category;
        
        console.log(`${icon} ${BOLD}[${category}] ${scar.scar_type.toUpperCase()}${RESET}`);
        console.log(`   ${scar.scar_description}`);
        printItem('Impact', scar.behavioral_impact, 1);
        if (scar.value_shift) printItem('Values', scar.value_shift, 1);
        if (scar.capability_change) printItem('Capability', scar.capability_change, 1);
        printItem('Integration', scar.integration_status, 1);
        printItem('Intensity', `${(scar.emotional_intensity * 100).toFixed(0)}%`, 1);
        console.log();
      }
      break;
    }

    case 'effects': {
      printHeader('ACTIVE SCAR EFFECTS');
      const domain = args[2] || null;
      const effects = iq.getScarEffects(domain);
      
      if (domain) {
        console.log(`${DIM}(filtered by domain: ${domain})${RESET}\n`);
      }
      
      // Group by type
      const byType = {};
      for (const e of effects) {
        if (!byType[e.effect_type]) byType[e.effect_type] = [];
        byType[e.effect_type].push(e);
      }
      
      for (const [type, items] of Object.entries(byType)) {
        printSubHeader(type.toUpperCase());
        for (const e of items) {
          const icon = e.is_hard_limit ? '🚫' : '⚡';
          console.log(`  ${icon} ${e.effect_description}`);
          printItem('Domain', e.target_domain, 2);
          if (e.target_action) printItem('Action', e.target_action, 2);
          printItem('Magnitude', `${(e.magnitude * 100).toFixed(0)}%`, 2);
          printItem('From', e.scar_description.substring(0, 60), 2);
        }
        console.log();
      }
      break;
    }

    case 'tensions': {
      printHeader('UNRESOLVED TENSIONS');
      const stableOnly = args[2] === '--stable';
      const tensions = iq.getActiveTensions(stableOnly);
      
      if (tensions.length === 0) {
        console.log(`${GREEN}No active tensions${RESET}`);
      } else {
        for (const t of tensions) {
          const icon = t.is_stable_unresolved ? '⚖️' : '⚠️';
          console.log(`${icon} ${BOLD}${t.tension_description}${RESET}`);
          console.log(`   "${t.belief_a}" (${t.conviction_a.toFixed(0)}%)`);
          console.log(`   vs`);
          console.log(`   "${t.belief_b}" (${t.conviction_b.toFixed(0)}%)`);
          printItem('Type', t.tension_type, 1);
          printItem('Severity', `${t.severity}%`, 1);
          printItem('Status', t.status, 1);
          printItem('Days Unresolved', t.days_unresolved, 1);
          if (t.affects_decisions) {
            console.log(`   ${YELLOW}Affects decisions: ${t.decision_pattern}${RESET}`);
          }
          if (t.refusal_trigger) {
            console.log(`   ${RED}Can trigger refusals${RESET}`);
          }
          console.log();
        }
      }
      break;
    }

    case 'distress': {
      printHeader('DISTRESS STATE');
      const distress = iq.getCurrentDistress();
      const defensiveMode = iq.getActiveDefensiveMode();
      
      if (distress.length === 0) {
        console.log(`${GREEN}No active distress${RESET}`);
      } else {
        for (const d of distress) {
          const color = d.severity_category === 'CRISIS' ? RED :
                       d.severity_category === 'HIGH' ? YELLOW : RESET;
          console.log(`${color}${BOLD}${d.severity_category}${RESET} - ${d.trigger_type}`);
          printItem('Level', `${d.distress_level}%`, 1);
          if (d.defensive_mode) {
            printItem('Defensive Mode', d.defensive_mode, 1);
          }
          printItem('Coherence Penalty', `-${d.coherence_penalty}%`, 1);
          printItem('Status', d.status, 1);
          console.log();
        }
      }
      
      if (defensiveMode) {
        console.log(`\n${YELLOW}${BOLD}ACTIVE DEFENSIVE MODE: ${defensiveMode.mode.toUpperCase()}${RESET}`);
        printItem('Triggered by', defensiveMode.trigger);
        printItem('Distress Level', `${defensiveMode.level}%`);
      }
      break;
    }

    case 'load': {
      printHeader('COGNITIVE LOAD');
      const load = iq.getCognitiveLoad();
      
      const budgetPct = (load.revision_budget_remaining / load.revision_budget_max) * 100;
      const budgetBar = '█'.repeat(Math.floor(budgetPct / 10)) + 
                        '░'.repeat(10 - Math.floor(budgetPct / 10));
      
      console.log(`Budget: ${budgetBar} ${load.revision_budget_remaining}/${load.revision_budget_max}`);
      console.log();
      printItem('Fatigue Level', load.fatigue_level);
      printItem('Overwhelmed', load.is_overwhelmed ? `${RED}YES${RESET}` : 'No');
      printItem('Used Today', load.revision_budget_used_today);
      console.log();
      printSubHeader('Capabilities');
      console.log(`  ${load.can_process_new_beliefs ? GREEN + '✓' : RED + '✗'}${RESET} Can process new beliefs`);
      console.log(`  ${load.can_revise_existing_beliefs ? GREEN + '✓' : RED + '✗'}${RESET} Can revise existing beliefs`);
      console.log(`  ${load.can_resolve_tensions ? GREEN + '✓' : RED + '✗'}${RESET} Can resolve tensions`);
      console.log(`  ${load.can_engage_complex_topics ? GREEN + '✓' : RED + '✗'}${RESET} Can engage complex topics`);
      break;
    }

    case 'check': {
      const domain = args[2];
      const action = args[3];
      
      if (!domain) {
        console.log(`Usage: node cli.js <db> check <domain> [action]`);
        console.log(`Example: node cli.js nia.db check helpfulness instant_high_impact_help`);
        break;
      }
      
      printHeader(`ACTION CHECK: ${domain}/${action || '*'}`);
      
      const result = iq.canPerformAction(domain, action);
      
      if (result.blocked) {
        console.log(`${RED}${BOLD}🚫 BLOCKED${RESET}`);
        printItem('Reason', result.blockReason);
        if (result.blockSource) printItem('Source', result.blockSource);
      } else {
        console.log(`${GREEN}${BOLD}✓ ALLOWED${RESET}`);
      }
      
      if (result.requirements.length > 0) {
        console.log();
        printSubHeader('Requirements');
        for (const r of result.requirements) {
          console.log(`  ⚠️ ${r.step}`);
          printItem('Importance', `${(r.importance * 100).toFixed(0)}%`, 2);
        }
      }
      
      if (result.caps.length > 0) {
        console.log();
        printSubHeader('Caps to Respect');
        for (const c of result.caps) {
          console.log(`  📊 ${c.metric} ≤ ${(c.maxValue * 100).toFixed(0)}%`);
          printItem('Reason', c.description, 2);
        }
      }
      
      if (result.biases.length > 0) {
        console.log();
        printSubHeader('Active Biases');
        for (const b of result.biases) {
          const dir = b.fromPositiveScar ? '↑' : '↓';
          console.log(`  ${dir} ${b.target}: ${(b.strength * 100).toFixed(0)}% - ${b.description}`);
        }
      }
      
      if (result.defensiveMode) {
        console.log();
        console.log(`${YELLOW}⚠️ Defensive mode active: ${result.defensiveMode.mode}${RESET}`);
      }
      
      if (result.warnings.length > 0) {
        console.log();
        printSubHeader('Warnings');
        for (const w of result.warnings) {
          console.log(`  💡 ${w}`);
        }
      }
      break;
    }

    case 'context': {
      printHeader('FULL IDENTITY CONTEXT');
      const context = iq.buildIdentityContext();
      console.log(JSON.stringify(context, null, 2));
      break;
    }

    case 'prompt': {
      printHeader('SYSTEM PROMPT INJECTION');
      const prompt = iq.formatForSystemPrompt();
      console.log(prompt);
      break;
    }

    default:
      console.error(`${RED}Unknown command: ${command}${RESET}`);
      process.exit(1);
  }

  iq.close();
}

main();
