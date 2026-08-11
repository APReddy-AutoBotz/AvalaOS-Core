const codes = [
  'ACCESS_DENIED','AUTHORIZATION_STALE','VALIDATION_FAILED','IDEMPOTENCY_CONFLICT','VERSION_CONFLICT',
  'FEATURE_DISABLED','TENANT_DEPROVISIONED','ENVIRONMENT_BLOCKED','MAINTENANCE_ACTIVE','READ_ONLY_ACTIVE',
  'MAINTENANCE_MODE','READ_ONLY_MODE','EXPECTED_VERSION_REQUIRED','EVIDENCE_STALE','EVIDENCE_INVALID',
  'EVIDENCE_NOT_VERIFIED','PREFLIGHT_BLOCKED','PROVIDER_REFERENCE_STALE','PROVIDER_REFERENCE_INVALID','ROLLBACK_NOT_ELIGIBLE','SEPARATION_OF_DUTY_REQUIRED',
  'LIVE_ACTIVATION_NOT_AUTHORIZED',
] as const;
export type PilotOperationsGovernedCode = typeof codes[number];
const allowed = new Set<string>(codes);
const pattern = new RegExp(`(?:^|\\b)(${codes.join('|')})(?:\\b|$)`);

/** Decode only stable governed codes; never forward arbitrary SQL/PostgREST text. */
export const decodePilotOperationsFailure = async (response: Response): Promise<PilotOperationsGovernedCode | null> => {
  let body: unknown;
  try { body = await response.json(); } catch { return null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  for (const field of ['code','message','details','hint']) {
    const value = (body as Record<string, unknown>)[field];
    if (typeof value !== 'string') continue;
    const match = value.match(pattern);
    if (match && allowed.has(match[1])) return match[1] as PilotOperationsGovernedCode;
  }
  return null;
};

export const pilotOperationsFailureStatus = (code: PilotOperationsGovernedCode) =>
  ['VERSION_CONFLICT','AUTHORIZATION_STALE','IDEMPOTENCY_CONFLICT','EVIDENCE_STALE'].includes(code) ? 409 :
  ['FEATURE_DISABLED','ENVIRONMENT_BLOCKED','ROLLBACK_NOT_ELIGIBLE','SEPARATION_OF_DUTY_REQUIRED','MAINTENANCE_ACTIVE','READ_ONLY_ACTIVE','MAINTENANCE_MODE','READ_ONLY_MODE','PREFLIGHT_BLOCKED'].includes(code) ? 423 :
  ['ACCESS_DENIED','TENANT_DEPROVISIONED','LIVE_ACTIVATION_NOT_AUTHORIZED'].includes(code) ? 403 : 400;
