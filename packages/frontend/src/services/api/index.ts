// Core client utilities
export { ApiError } from './client.js';

// Skills CRUD
export { createSkill, fetchSkills, fetchSkill, fetchSkillMetadata, updateSkill, deleteSkill, checkSkillNameExists, publishSkill } from './skills.js';
export type { CreateSkillRequest } from './skills.js';

// Version history
export { fetchVersionHistory, fetchVersionSnapshot } from './versions.js';

// Generation
export { generateSkill, refineSkill } from './generation.js';

// Draft optimization
export { optimizeDraft, approveOptimization } from './optimization.js';

// Suggestions
export { fetchSuggestions } from './suggestions.js';

// Export / download
export { exportSkillZip } from './export.js';

// Evals
export {
  createEvalCase,
  fetchEvalCases,
  updateEvalCase,
  deleteEvalCase,
  runEvals,
  fetchEvalRuns,
  deleteEvalRun,
  fetchFeedback,
  saveFeedback,
  fetchBenchmark,
  fetchTestPromptSuggestions,
  generateTestEvals,
  bulkCreateEvalCases,
  suggestAssertionReplacements,
  explainFailure,
} from './evals.js';

// Diagrams
export { generateDiagram } from './diagrams.js';

// Profile / auth
export { getProfile, updateProfile, changePassword } from './profile.js';

// Users (admin)
export { getUsers, updateUser, deleteUser, getInviteSmtpStatus, inviteUsers, validateInvite, completeInvite } from './users.js';

// Personal Access Tokens
export { listPats, createPat, revokePat } from './tokens.js';
export type { PatListItem, CreatePatResponse } from './tokens.js';

// Skill sharing
export { resolveSharedSkill, downloadSharedSkillZip } from './sharing.js';
export type { SharedSkillResponse } from './sharing.js';
