/**
 * BELIEF FORMATION SYSTEM - Module Index
 * Exports all belief formation modules
 */

const BeliefDetector = require('./belief-detector');
const BeliefFormer = require('./belief-former');
const BeliefEmbedder = require('./belief-embedder');
const BeliefRelationship = require('./belief-relationship');
const BeliefMaturation = require('./belief-maturation');

module.exports = {
  BeliefDetector,
  BeliefFormer,
  BeliefEmbedder,
  BeliefRelationship,
  BeliefMaturation
};
