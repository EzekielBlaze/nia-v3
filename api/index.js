/**
 * API ENDPOINTS - Module Index
 * Exports all API endpoints
 */

const ChatAPI = require('./api-chat');
const CommitMemoryAPI = require('./api-commit-memory');
const RecallMemoriesAPI = require('./api-recall-memories');
const BeliefsAPI = require('./api-beliefs');
const CorrectionsAPI = require('./api-corrections');
const StatusAPI = require('./api-status');

/**
 * Register all API endpoints with IPC server
 */
function registerAllAPIs(daemon, ipcServer) {
  const apis = [
    new ChatAPI(daemon),
    new CommitMemoryAPI(daemon),
    new RecallMemoriesAPI(daemon),
    new BeliefsAPI(daemon),
    new CorrectionsAPI(daemon),
    new StatusAPI(daemon)
  ];
  
  for (const api of apis) {
    api.register(ipcServer);
  }
  
  return apis;
}

module.exports = {
  ChatAPI,
  CommitMemoryAPI,
  RecallMemoriesAPI,
  BeliefsAPI,
  CorrectionsAPI,
  StatusAPI,
  registerAllAPIs
};
