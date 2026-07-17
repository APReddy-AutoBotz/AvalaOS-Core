import { buildDecisionVersionV2 } from '../../../services/assessV2/index.ts';
import { ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION, assertRuntimeCloneContract, cloneV1AssessmentToV2 } from '../../../services/assessV1Compatibility.ts';
import { ASSESS_V2_COMMAND_CAPABILITY } from '../../../services/assessV2/capabilities.ts';
import { ASSESS_V2_CLONE_REQUIRED_CAPABILITIES, AssessV2AtomicCommand, AssessV2Dependencies, AssessV2Envelope, AssessV2Error } from './assessV2Command.ts';

export const executeAssessV2Command = async (request: Request, envelope: AssessV2Envelope, dependencies: AssessV2Dependencies) => {
  let actor: { id: string };
  try { actor = await dependencies.authenticate(request); } catch { throw new AssessV2Error('AUTHENTICATION_REQUIRED'); }
  const authority = await dependencies.loadFreshAuthority({ request, actorId: actor.id, organizationId: envelope.organizationId, workspaceId: envelope.workspaceId });
  if (!authority || authority.actorId !== actor.id || authority.organizationId !== envelope.organizationId || authority.workspaceId !== envelope.workspaceId) throw new AssessV2Error('RESOURCE_NOT_AVAILABLE');
  if (authority.authorizationVersion !== envelope.authorizationVersion) throw new AssessV2Error('AUTHORITY_STALE');
  if (!authority.capabilities.includes(ASSESS_V2_COMMAND_CAPABILITY[envelope.commandType])) throw new AssessV2Error('PERMISSION_DENIED');
  if (envelope.commandType === 'assessment_v2.clone_from_v1' && ASSESS_V2_CLONE_REQUIRED_CAPABILITIES.some(capability => !authority.capabilities.includes(capability))) {
    throw new AssessV2Error('PERMISSION_DENIED');
  }
  const command = { ...envelope, actorId: actor.id } as AssessV2AtomicCommand;
  if (envelope.commandType === 'assessment_v2.clone_from_v1') {
    const sourceAssessmentId = envelope.payload.sourceAssessmentId as string;
    const source = await dependencies.loadFrozenV1AssessmentForClone({ sourceAssessmentId, organizationId: envelope.organizationId, workspaceId: envelope.workspaceId });
    if (!source || source.id !== sourceAssessmentId) throw new AssessV2Error('RESOURCE_NOT_AVAILABLE');
    try {
      const projection = cloneV1AssessmentToV2(source, { caseId: envelope.payload.caseId as string, organizationId: envelope.organizationId, workspaceId: envelope.workspaceId, ownerId: actor.id, clonedAt: new Date().toISOString() });
      command.serverCloneProjection = Object.freeze({
        contractVersion: ASSESS_V1_TO_V2_CLONE_CONTRACT_VERSION,
        sourceAssessmentId,
        sourceProcessId: projection.sourceProcessId,
        sourceV1: projection.sourceV1!,
        importedFacts: projection.importedFacts ?? [],
        evidence: projection.evidence,
        agentNecessity: projection.agentNecessity,
        importedFactCount: projection.importedFacts?.length ?? 0,
        importedEvidenceCount: projection.evidence.length,
      });
    } catch {
      // Incompatible or cross-ancestry sources are intentionally non-disclosing.
      throw new AssessV2Error('RESOURCE_NOT_AVAILABLE');
    }
  }
  if (envelope.commandType === 'assessment_v2.finalize') {
    const source = await dependencies.loadLockedCaseForFinalize({ caseId: envelope.payload.caseId as string, organizationId: envelope.organizationId, workspaceId: envelope.workspaceId, expectedVersion: envelope.expectedVersion! });
    if (!source) throw new AssessV2Error('RESOURCE_NOT_AVAILABLE');
    command.serverDecision = await buildDecisionVersionV2(source, actor.id, new Date().toISOString());
  }
  const result = await dependencies.executeAtomicCommand(command);
  if (envelope.commandType === 'assessment_v2.clone_from_v1') {
    try { assertRuntimeCloneContract(result.resource, command.serverCloneProjection); } catch { throw new AssessV2Error('COMMAND_UNAVAILABLE'); }
  }
  return result;
};
