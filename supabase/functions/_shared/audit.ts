import { insertRow, updateRow } from './supabase.ts';

export const REQUIRED_AI_AUDIT_ERROR = 'Required AI audit persistence failed.';

type JobInput = {
  orgId: string;
  userId: string;
  jobType: string;
  provider?: string;
  model?: string;
  inputRefs?: Record<string, unknown>;
};

type UsageInput = {
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
};

const requiredAuditError = (): never => {
  throw new Error(REQUIRED_AI_AUDIT_ERROR);
};

export const createAiJob = async (input: JobInput) => {
  try {
    const job = await insertRow<{ id: string }>('ai_generation_jobs', {
      org_id: input.orgId,
      user_id: input.userId,
      job_type: input.jobType,
      status: 'running',
      model: input.model,
      input_refs: {
        ...(input.inputRefs || {}),
        ...(input.provider ? { provider: input.provider } : {}),
      },
      started_at: new Date().toISOString(),
    });
    if (!job?.id) requiredAuditError();
    return job;
  } catch {
    return requiredAuditError();
  }
};

export const completeAiJob = async (
  jobId: string | undefined,
  status: 'succeeded' | 'failed',
  outputRef: Record<string, unknown>,
  errorMessage?: string,
) => {
  if (!jobId) requiredAuditError();
  try {
    const job = await updateRow<{ id: string }>('ai_generation_jobs', jobId, {
      status,
      output_ref: outputRef,
      error_message: errorMessage || null,
      completed_at: new Date().toISOString(),
    });
    if (!job?.id) requiredAuditError();
  } catch {
    requiredAuditError();
  }
};

export const failAiJobBestEffort = async (
  jobId: string | undefined,
  errorMessage: string,
) => {
  if (!jobId) return;
  try {
    await updateRow('ai_generation_jobs', jobId, {
      status: 'failed',
      output_ref: {},
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    });
  } catch {
    // The primary operation has already failed; do not mask its controlled error.
  }
};

const usageRow = (input: UsageInput) => ({
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

export const recordAiUsageRequired = async (input: UsageInput) => {
  try {
    const event = await insertRow<{ id: string }>('ai_usage_events', usageRow(input));
    if (!event?.id) requiredAuditError();
    return event;
  } catch {
    return requiredAuditError();
  }
};

export const recordAiUsageBestEffort = async (input: UsageInput) => {
  try {
    await insertRow('ai_usage_events', usageRow(input));
  } catch {
    // Token telemetry is supplemental; the required job lifecycle audit remains authoritative.
  }
};
