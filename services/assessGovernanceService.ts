import { useCallback, useEffect, useMemo, useState } from 'react';
import { Assessment, AssessmentSectionKey, Assumption, EvidenceItem } from '../types';
import {
    ASSESS_REVIEWER_CHECKPOINTS,
    ASSESS_TEMPLATE_RULES,
    ASSUMPTION_CATEGORIES,
    AssessReviewerCheckpointDefinition,
    AssessTemplateRule,
    EVIDENCE_TYPES,
} from '../constants/assessQuestionBank';
import { StorageKeys, StorageService } from './storage';
import { useOrganizationContext } from '../components/auth/OrganizationProvider';

export interface AssessEvidencePolicy {
    requireLinkedEvidenceForProtectedFields: boolean;
    minEvidenceItemsForApproval: number;
    restrictedEvidenceNeedsReviewer: boolean;
    lowConfidenceRequiresReviewer: boolean;
    requireOwnerOnEvidence: boolean;
    requireOwnerOnAssumptions: boolean;
    assumptionReviewDaysDefault: number;
}

export interface ConfigurableAssessTemplateRule extends AssessTemplateRule {
    enabled: boolean;
}

export interface ConfigurableReviewerCheckpoint extends Omit<AssessReviewerCheckpointDefinition, 'condition'> {
    enabled: boolean;
}

export interface AssessGovernanceConfig {
    orgId: string;
    version: string;
    updatedAt: string;
    templateRules: ConfigurableAssessTemplateRule[];
    reviewerCheckpoints: ConfigurableReviewerCheckpoint[];
    evidenceTypes: EvidenceItem['type'][];
    assumptionCategories: Assumption['category'][];
    evidencePolicy: AssessEvidencePolicy;
}

const DEFAULT_EVIDENCE_POLICY: AssessEvidencePolicy = {
    requireLinkedEvidenceForProtectedFields: true,
    minEvidenceItemsForApproval: 2,
    restrictedEvidenceNeedsReviewer: true,
    lowConfidenceRequiresReviewer: true,
    requireOwnerOnEvidence: true,
    requireOwnerOnAssumptions: true,
    assumptionReviewDaysDefault: 30,
};

type StoredConfigByOrg = Record<string, AssessGovernanceConfig>;

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

export function buildDefaultAssessGovernanceConfig(orgId: string): AssessGovernanceConfig {
    return {
        orgId,
        version: 'assess-core-2026-05',
        updatedAt: new Date().toISOString(),
        templateRules: ASSESS_TEMPLATE_RULES.map(rule => ({ ...clone(rule), enabled: true })),
        reviewerCheckpoints: ASSESS_REVIEWER_CHECKPOINTS.map(({ condition: _condition, ...checkpoint }) => ({
            ...clone(checkpoint),
            enabled: true,
        })),
        evidenceTypes: [...EVIDENCE_TYPES],
        assumptionCategories: [...ASSUMPTION_CATEGORIES],
        evidencePolicy: { ...DEFAULT_EVIDENCE_POLICY },
    };
}

function mergeWithDefaults(orgId: string, stored?: Partial<AssessGovernanceConfig>): AssessGovernanceConfig {
    const defaults = buildDefaultAssessGovernanceConfig(orgId);
    if (!stored) return defaults;

    const storedTemplateRules = stored.templateRules || [];
    const storedCheckpoints = stored.reviewerCheckpoints || [];

    return {
        ...defaults,
        ...stored,
        orgId,
        version: stored.version || defaults.version,
        updatedAt: stored.updatedAt || defaults.updatedAt,
        evidencePolicy: {
            ...defaults.evidencePolicy,
            ...(stored.evidencePolicy || {}),
        },
        evidenceTypes: stored.evidenceTypes?.length ? stored.evidenceTypes : defaults.evidenceTypes,
        assumptionCategories: stored.assumptionCategories?.length ? stored.assumptionCategories : defaults.assumptionCategories,
        templateRules: defaults.templateRules.map(defaultRule => {
            const override = storedTemplateRules.find(rule => rule.templateId === defaultRule.templateId);
            return override ? { ...defaultRule, ...override } : defaultRule;
        }),
        reviewerCheckpoints: defaults.reviewerCheckpoints.map(defaultCheckpoint => {
            const override = storedCheckpoints.find(checkpoint => checkpoint.id === defaultCheckpoint.id);
            return override ? { ...defaultCheckpoint, ...override } : defaultCheckpoint;
        }),
    };
}

export function getAssessTemplateRuleFromConfig(templateId?: string | null, config?: AssessGovernanceConfig): ConfigurableAssessTemplateRule | undefined {
    if (!templateId || !config) return undefined;
    return config.templateRules.find(rule => rule.enabled && rule.templateId === templateId);
}

export function getReviewerCheckpointsForSectionFromConfig(
    section: AssessmentSectionKey,
    assessment: Assessment,
    templateRule?: AssessTemplateRule,
    config?: AssessGovernanceConfig,
): AssessReviewerCheckpointDefinition[] {
    if (!config) return [];
    return config.reviewerCheckpoints
        .filter(checkpoint => checkpoint.enabled && checkpoint.section === section)
        .map(checkpoint => {
            const base = ASSESS_REVIEWER_CHECKPOINTS.find(item => item.id === checkpoint.id);
            return {
                ...checkpoint,
                condition: base?.condition,
            };
        })
        .filter(checkpoint => !checkpoint.condition || checkpoint.condition(assessment, templateRule));
}

export function useAssessGovernanceConfig() {
    const { currentOrganization } = useOrganizationContext();
    const orgId = currentOrganization?.id || 'default-org';
    const [configByOrg, setConfigByOrg] = useState<StoredConfigByOrg>(() => StorageService.load(StorageKeys.ASSESS_GOVERNANCE_CONFIG, {} as StoredConfigByOrg));

    useEffect(() => {
        StorageService.save(StorageKeys.ASSESS_GOVERNANCE_CONFIG, configByOrg);
    }, [configByOrg]);

    const config = useMemo(() => mergeWithDefaults(orgId, configByOrg[orgId]), [configByOrg, orgId]);

    const saveConfig = useCallback((nextConfig: AssessGovernanceConfig) => {
        setConfigByOrg(prev => ({
            ...prev,
            [nextConfig.orgId]: {
                ...nextConfig,
                updatedAt: new Date().toISOString(),
            },
        }));
    }, []);

    const updateConfig = useCallback((updater: (current: AssessGovernanceConfig) => AssessGovernanceConfig) => {
        const next = updater(config);
        saveConfig(next);
    }, [config, saveConfig]);

    const resetConfig = useCallback(() => {
        saveConfig(buildDefaultAssessGovernanceConfig(orgId));
    }, [orgId, saveConfig]);

    return {
        config,
        updateConfig,
        saveConfig,
        resetConfig,
    };
}
