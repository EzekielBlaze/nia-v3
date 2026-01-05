/**
 * NLP PARSERS - Module Index
 * Exports all parser modules
 */

const CommitParser = require('./commit-parser');
const CorrectionParser = require('./correction-parser');
const TopicExtractor = require('./topic-extractor');
const SubjectExtractor = require('./subject-extractor');

module.exports = {
  CommitParser,
  CorrectionParser,
  TopicExtractor,
  SubjectExtractor
};
