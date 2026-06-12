import { AssessmentScoreResult } from '../../types';

interface BacklogSeedItem {
    type: string;
    title: string;
    rationale: string;
}

const uniqueStrings = (items: unknown[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of items) {
        if (typeof item !== 'string') continue;
        const normalized = item.trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
    }

    return result;
};

const stringsFrom = (value: unknown): string[] => Array.isArray(value) ? uniqueStrings(value) : [];

export const getDecisionRationaleItems = (scores?: AssessmentScoreResult | null): string[] =>
    stringsFrom(scores?.decisionPack?.recommendedOperatingModel?.whyThis);

export const getReadinessValue = (scores?: AssessmentScoreResult | null, fallbackValue = 0): number => {
    const readiness = scores?.supportingScores?.handoffReadiness;
    const value = typeof readiness === 'number' && Number.isFinite(readiness)
        ? readiness
        : fallbackValue;

    return Math.round(typeof value === 'number' && Number.isFinite(value) ? value : 0);
};

export const getDecisionGovernanceControlItems = (scores?: AssessmentScoreResult | null): string[] => {
    const governance = scores?.decisionPack?.governance;
    const decisionPackControls = uniqueStrings([
        ...(Array.isArray(governance?.auditControls) ? governance.auditControls : []),
        ...(Array.isArray(governance?.dataControls) ? governance.dataControls : []),
        ...(Array.isArray(governance?.monitoringControls) ? governance.monitoringControls : []),
        ...(Array.isArray(governance?.securityControls) ? governance.securityControls : []),
        ...(Array.isArray(governance?.modelProviderControls) ? governance.modelProviderControls : []),
    ]);

    return decisionPackControls.length > 0 ? decisionPackControls : stringsFrom(scores?.handoffPack?.governanceControls);
};

export const getRequiredDocumentTypes = (scores?: AssessmentScoreResult | null): string[] =>
    stringsFrom(scores?.handoffPack?.requiredDocumentTypes);

export const getBacklogSeedItems = (scores?: AssessmentScoreResult | null): BacklogSeedItem[] => {
    const items = scores?.handoffPack?.suggestedBacklogItems;
    if (!Array.isArray(items)) return [];

    return items
        .filter(item => item && typeof item === 'object')
        .map(item => {
            const candidate = item as Partial<BacklogSeedItem>;
            return {
                title: typeof candidate.title === 'string' ? candidate.title.trim() : '',
                type: typeof candidate.type === 'string' ? candidate.type.trim() : 'Task',
                rationale: typeof candidate.rationale === 'string' ? candidate.rationale.trim() : '',
            };
        })
        .filter(item => item.title.length > 0);
};
