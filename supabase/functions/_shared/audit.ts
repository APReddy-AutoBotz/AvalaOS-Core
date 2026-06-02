import { insertRow, updateRow } from './supabase.ts';

type JobInput = {
  orgId: string;
  userId: string;
  jobType: string;
  provider?: string;
  model?: string;
  inputRefs?: Record<string, unknown>;
};

export const createAiJob = async (input: JobInput) => {
  try {
    return await insertRow<{ id: string }>('ai_generation_jobs', {
      org_id: input.orgId,
      user_id: input.userId,
      job_type: input.jobType,
      status: 'running',
      model: input.model,
      input_refs: input.inputRefs || {},
      started_at: new Date().toISOString(),
    });
  } catch {
    return null;
  }
};

export const completeAiJob = async (
  jobId: string | undefined,
  status: 'succeeded' | 'failed',
  outputRef: Record<string, unknown>,
  errorMessage?: string,
) => {
  if (!jobId) return;
  try {
    await updateRow('ai_generation_jobs', jobId, {
      status,
      output_ref: outputRef,
      error_message: errorMessage || null,
      completed_at: new Date().toISOString(),
    });
  } catch {
    // Do not fail the user-facing AI request because audit persistence failed.
  }
};

export const recordAiUsage = async (input: {
  orgId: string;
  userId: string;
  jobId?: string;
  provider: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  outputArtifactType?: string;
  outputArtifactId?: string;
  metadata?: Record<string, unknown>;
}) => {
  try {
    await insertRow('ai_usage_events', {
      org_id: input.orgId,
      user_id: input.userId,
      job_id: input.jobId,
      provider: input.provider,
      model: input.model,
      input_tokens: input.inputTokens || 0,
      output_tokens: input.outputTokens || 0,
      total_tokens: input.totalTokens || 0,
      output_artifact_type: input.outputArtifactType,
      output_artifact_id: input.outputArtifactId,
      metadata: input.metadata || {},
    });
  } catch {
    // Usage logging must be best-effort until the migration is confirmed live.
  }
};
