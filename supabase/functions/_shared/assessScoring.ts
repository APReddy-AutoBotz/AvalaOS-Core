// The server and browser deliberately share this locked deterministic implementation.
// This module contains no alternate formula, weight, threshold, or AI decision path.
export {
  calculateAssessmentScores,
  CURRENT_SCORE_VERSION,
  ScoringValidationError,
} from '../../../services/scoringEngine.ts';
