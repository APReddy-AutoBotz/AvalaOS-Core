import type { ControlledHumanCompletedProof, ControlledHumanStepBindingOption } from '../../services/supabaseClient';

export const controlledHumanStepKey = (option: Pick<ControlledHumanStepBindingOption, 'checkpointId' | 'stepId'>) => `${option.checkpointId}:${option.stepId}`;

export const completedControlledHumanOptions = (options: readonly ControlledHumanStepBindingOption[]) =>
  options.filter((option): option is ControlledHumanStepBindingOption & Required<Pick<ControlledHumanStepBindingOption, 'safeAnchor' | 'safeBinding'>> =>
    option.state === 'completed' && option.safeAnchor !== null && option.safeBinding !== null);

export const selectControlledHumanProof = (
  options: readonly ControlledHumanStepBindingOption[],
  selectedKey: string,
  lastCompleted: ControlledHumanCompletedProof | null,
): { key: string; proof: ControlledHumanCompletedProof } | null => {
  const completed = completedControlledHumanOptions(options);
  const selected = completed.find(option => controlledHumanStepKey(option) === selectedKey);
  if (selected) return { key: controlledHumanStepKey(selected), proof: { safeAnchor: selected.safeAnchor, safeBinding: selected.safeBinding } };
  const latest = lastCompleted && completed.find(option => option.safeBinding.bindingToken === lastCompleted.safeBinding.bindingToken
    && option.safeAnchor.challengeToken === lastCompleted.safeAnchor.challengeToken);
  if (latest) return { key: controlledHumanStepKey(latest), proof: lastCompleted };
  const fallback = completed.at(-1);
  return fallback ? { key: controlledHumanStepKey(fallback), proof: { safeAnchor: fallback.safeAnchor, safeBinding: fallback.safeBinding } } : null;
};
