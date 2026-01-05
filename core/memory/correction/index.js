/**
 * CORRECTION SYSTEM - Module Index
 * Exports all correction modules
 */

const CorrectionDetector = require('./correction-detector');
const CorrectionExemptions = require('./correction-exemptions');
const CorrectionHandler = require('./correction-handler');
const UncertaintyDetector = require('./uncertainty-detector');
const ClarificationAsker = require('./clarification-asker');

module.exports = {
  CorrectionDetector,
  CorrectionExemptions,
  CorrectionHandler,
  UncertaintyDetector,
  ClarificationAsker
};
