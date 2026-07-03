import React, { useMemo, useState } from 'react';
import { ProductModuleKey, User } from '../../types';
import { useOrganization } from '../../services/organizationService';
import { ALL_PRODUCT_MODULES, DEFAULT_ENABLED_MODULES } from '../../constants/moduleConfig';
import { useAssessGovernanceConfig } from '../../services/assessGovernanceService';
import { ASSESS_SECTIONS, ASSUMPTION_CATEGORIES, EVIDENCE_TYPES, getAssessFieldOptions } from '../../constants/assessQuestionBank';
import AdminOverviewPanel from '../admin/AdminOverviewPanel';
import AdminWorkbench from '../admin/AdminWorkbench';
import TrustCenterPanel from '../admin/TrustCenterPanel';

interface OrganizationSetupViewProps {
    currentUser: User;
    allUsers: User[]; // Used to map ID to names in the UI
}

const OrganizationSetupView: React.FC<OrganizationSetupViewProps> = ({ currentUser, allUsers }) => {
    const { currentOrganization, updateCompanyProfile, updateOrganizationModules, getLimitsForCurrentOrg, getAuditLogsForOrg } = useOrganization();
    const { config: assessGovernanceConfig, updateConfig: updateAssessGovernanceConfig, resetConfig: resetAssessGovernanceConfig } = useAssessGovernanceConfig();

    // Local form state
    const [industry, setIndustry] = useState(currentOrganization?.profile.industry || '');
    const [size, setSize] = useState(currentOrganization?.profile.size || '');
    const [geography, setGeography] = useState(currentOrganization?.profile.geography || '');
    const [strategicGoals, setStrategicGoals] = useState(currentOrganization?.profile.strategicGoals || '');
    const [enabledModules, setEnabledModules] = useState<ProductModuleKey[]>(currentOrganization?.enabledModules || DEFAULT_ENABLED_MODULES);
    const [validationError, setValidationError] = useState('');
    const [saveMessage, setSaveMessage] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState(assessGovernanceConfig.templateRules[0]?.templateId || '');
    const [templatePriorityFieldDraft, setTemplatePriorityFieldDraft] = useState('');
    const [templateEvidenceFieldDraft, setTemplateEvidenceFieldDraft] = useState('');

    if (!currentOrganization) return <div className="p-8">Loading Organization Context...</div>;

    const limits = getLimitsForCurrentOrg();
    const auditLogs = getAuditLogsForOrg(currentOrganization.id);
    const assessFieldOptions = getAssessFieldOptions();
    const selectedTemplateRule = useMemo(() => {
        return assessGovernanceConfig.templateRules.find(rule => rule.templateId === selectedTemplateId) || assessGovernanceConfig.templateRules[0];
    }, [assessGovernanceConfig.templateRules, selectedTemplateId]);
    const sectionLabelByKey = useMemo(() => Object.fromEntries(ASSESS_SECTIONS.map(section => [section.key, section.label])), []);

    const handleSaveProfile = () => {
        setValidationError('');
        setSaveMessage('');

        // Negative Path Validation: Required fields
        if (!industry.trim() || !size.trim()) {
            setValidationError('Industry and Company Size are required fields.');
            return;
        }

        // Positive Path: Save Profile
        updateCompanyProfile(currentOrganization.id, {
            industry,
            size,
            geography,
            strategicGoals
        }, currentUser.id);

        setSaveMessage('Profile saved successfully.');
        setTimeout(() => setSaveMessage(''), 3000);
    };

    const toggleModule = (moduleKey: ProductModuleKey) => {
        setEnabledModules(prev => {
            const next = prev.includes(moduleKey)
                ? prev.filter(item => item !== moduleKey)
                : [...prev, moduleKey];
            return next.length === 0 ? prev : next;
        });
    };

    const handleSaveModules = async () => {
        setValidationError('');
        setSaveMessage('');
        if (enabledModules.length === 0) {
            setValidationError('At least one module must remain enabled.');
            return;
        }
        await updateOrganizationModules(currentOrganization.id, enabledModules);
        setSaveMessage('Module access updated successfully.');
        setTimeout(() => setSaveMessage(''), 3000);
    };

    const updateTemplateRule = (templateId: string, patch: Partial<typeof assessGovernanceConfig.templateRules[number]>) => {
        updateAssessGovernanceConfig(config => ({
            ...config,
            templateRules: config.templateRules.map(rule => rule.templateId === templateId ? { ...rule, ...patch } : rule),
        }));
    };

    const addTemplateField = (fieldType: 'priorityFields' | 'evidenceFields', fieldId: string) => {
        if (!selectedTemplateRule || !fieldId) return;
        const nextFields = Array.from(new Set([...selectedTemplateRule[fieldType], fieldId]));
        updateTemplateRule(selectedTemplateRule.templateId, { [fieldType]: nextFields } as Partial<typeof selectedTemplateRule>);
        if (fieldType === 'priorityFields') setTemplatePriorityFieldDraft('');
        if (fieldType === 'evidenceFields') setTemplateEvidenceFieldDraft('');
    };

    const removeTemplateField = (fieldType: 'priorityFields' | 'evidenceFields', fieldId: string) => {
        if (!selectedTemplateRule) return;
        updateTemplateRule(selectedTemplateRule.templateId, {
            [fieldType]: selectedTemplateRule[fieldType].filter(field => field !== fieldId),
        } as Partial<typeof selectedTemplateRule>);
    };

    const updateCheckpoint = (id: string, patch: Partial<typeof assessGovernanceConfig.reviewerCheckpoints[number]>) => {
        updateAssessGovernanceConfig(config => ({
            ...config,
            reviewerCheckpoints: config.reviewerCheckpoints.map(checkpoint => checkpoint.id === id ? { ...checkpoint, ...patch } : checkpoint),
        }));
    };

    const updateEvidencePolicy = (patch: Partial<typeof assessGovernanceConfig.evidencePolicy>) => {
        updateAssessGovernanceConfig(config => ({
            ...config,
            evidencePolicy: {
                ...config.evidencePolicy,
                ...patch,
            },
        }));
    };

    const toggleEvidenceType = (type: typeof EVIDENCE_TYPES[number]) => {
        updateAssessGovernanceConfig(config => {
            const nextTypes = config.evidenceTypes.includes(type)
                ? config.evidenceTypes.filter(item => item !== type)
                : [...config.evidenceTypes, type];
            return { ...config, evidenceTypes: nextTypes.length ? nextTypes : config.evidenceTypes };
        });
    };

    const toggleAssumptionCategory = (category: typeof ASSUMPTION_CATEGORIES[number]) => {
        updateAssessGovernanceConfig(config => {
            const nextCategories = config.assumptionCategories.includes(category)
                ? config.assumptionCategories.filter(item => item !== category)
                : [...config.assumptionCategories, category];
            return { ...config, assumptionCategories: nextCategories.length ? nextCategories : config.assumptionCategories };
        });
    };

    const getUserName = (id: string) => allUsers.find(u => u.id === id)?.name || id;

    const planLabel = `${currentOrganization.subscriptionTier.replace('_', ' ')} Plan`;

    return (
        <AdminWorkbench
            organizationName={currentOrganization.name}
            planLabel={planLabel}
            overview={
                <AdminOverviewPanel
                    organizationName={currentOrganization.name}
                    planLabel={planLabel}
                    enabledModuleCount={enabledModules.length}
                    totalModuleCount={ALL_PRODUCT_MODULES.length}
                    maxProcesses={limits?.maxProcesses}
                    maxTemplates={limits?.maxTemplates}
                />
            }
            organization={
                <div className="space-y-6">
            {/* Company Profile Form */}
            <section className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Company Profile</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Industry *</label>
                        <input type="text" value={industry} onChange={e => setIndustry(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="e.g., Financial Services" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Company Size *</label>
                        <select value={size} onChange={e => setSize(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent">
                            <option value="">Select Size</option>
                            <option value="1-50">1-50</option>
                            <option value="51-200">51-200</option>
                            <option value="201-1000">201-1000</option>
                            <option value="1000+">1000+</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Geography</label>
                        <input type="text" value={geography} onChange={e => setGeography(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="e.g., North America" />
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Strategic Goals</label>
                        <textarea value={strategicGoals} onChange={e => setStrategicGoals(e.target.value)} rows={3}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            placeholder="e.g., Reduce manual invoice processing time by 40%." />
                    </div>
                </div>

                {validationError && <div className="mt-4 text-sm text-red-600 dark:text-red-400">{validationError}</div>}
                {saveMessage && <div className="mt-4 text-sm text-green-600 dark:text-green-400">{saveMessage}</div>}

                <div className="mt-6 flex justify-end">
                    <button onClick={handleSaveProfile} className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark transition-colors">
                        Save Profile
                    </button>
                </div>
            </section>
            {/* Starter Pack Hook */}
            <section className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700 border-dashed">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Recommended Starter Packs</h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xl">
                            Based on your Industry ({industry || 'Not set'}), Avala Assess recommends pre-configured process templates to accelerate discovery.
                        </p>
                    </div>
                    <button disabled className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 font-medium rounded-lg cursor-not-allowed border border-slate-300 dark:border-slate-600" title="Catalog browsing is not enabled in this workspace configuration">
                        Browse Catalog (Not enabled)
                    </button>
                </div>
            </section>
                </div>
            }
            modules={
                <div className="space-y-6">
            <section className="premium-surface rounded-3xl p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Commercial configuration</p>
                        <h2 className="mt-1 text-xl font-black text-[#002C4B] dark:text-white">Enabled product modules</h2>
                        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                            Configure the workspace as Avala Assess-only, Avala Studio-only, Avala Delivery-only, Avala Monitor-only, any two-module bundle, or the complete governed lifecycle.
                        </p>
                    </div>
                    <button
                        onClick={handleSaveModules}
                        className="rounded-xl bg-[#ffbc03] px-4 py-2.5 text-sm font-black text-[#002C4B] shadow-lg shadow-[#ffbc03]/20 transition-transform hover:-translate-y-0.5"
                    >
                        Save Modules
                    </button>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {ALL_PRODUCT_MODULES.map(module => {
                        const enabled = enabledModules.includes(module.key);
                        return (
                            <button
                                key={module.key}
                                type="button"
                                onClick={() => toggleModule(module.key)}
                                className={`text-left rounded-2xl border p-5 transition-all ${enabled
                                    ? 'border-[#ffbc03]/70 bg-[#ffbc03]/10 shadow-lg shadow-[#ffbc03]/10'
                                    : 'border-slate-200 bg-white/50 opacity-75 dark:border-slate-800 dark:bg-slate-900/50'
                                    }`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-lg font-black text-slate-950 dark:text-white">{module.label}</p>
                                        <p className="mt-2 text-sm font-medium leading-6 text-slate-500 dark:text-slate-400">{module.description}</p>
                                    </div>
                                    <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${enabled ? 'bg-[#ffbc03]' : 'bg-slate-300 dark:bg-slate-700'}`}>
                                        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </section>
                </div>
            }
            trustCenter={<TrustCenterPanel />}
            evidencePolicy={
                <div className="space-y-6">
            <section className="premium-surface overflow-hidden rounded-3xl border border-[#002C4B]/10">
                <div className="bg-[#002C4B] p-6 text-white">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#ffbc03]">Assess governance</p>
                            <h2 className="mt-2 text-2xl font-black">Decision rules, reviews, and evidence policy</h2>
                            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/72">
                                Configure organization-specific assessment guidance without changing the deterministic scoring engine. These settings drive template guidance, reviewer overlays, evidence choices, and confidence controls.
                            </p>
                        </div>
                        <button
                            onClick={resetAssessGovernanceConfig}
                            className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-white/15"
                        >
                            Reset Defaults
                        </button>
                    </div>
                    <div className="mt-6 grid gap-3 sm:grid-cols-4">
                        {[
                            ['Templates', assessGovernanceConfig.templateRules.filter(rule => rule.enabled).length],
                            ['Checkpoints', assessGovernanceConfig.reviewerCheckpoints.filter(checkpoint => checkpoint.enabled).length],
                            ['Evidence types', assessGovernanceConfig.evidenceTypes.length],
                            ['Assumption types', assessGovernanceConfig.assumptionCategories.length],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                                <p className="text-2xl font-black text-[#ffbc03]">{value}</p>
                                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/60">{label}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="border-b border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/60 lg:border-b-0 lg:border-r">
                        <p className="mb-3 px-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Template packs</p>
                        <div className="space-y-2">
                            {assessGovernanceConfig.templateRules.map(rule => (
                                <button
                                    key={rule.templateId}
                                    type="button"
                                    onClick={() => setSelectedTemplateId(rule.templateId)}
                                    className={`w-full rounded-2xl border p-3 text-left transition-all ${selectedTemplateRule?.templateId === rule.templateId
                                        ? 'border-[#ffbc03] bg-[#ffbc03]/15 text-[#002C4B] shadow-sm'
                                        : 'border-slate-200 bg-white/80 text-slate-600 hover:border-[#ffbc03]/50 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-black">{rule.label}</p>
                                            <p className="mt-1 text-xs font-semibold leading-5 opacity-70">{rule.focus}</p>
                                        </div>
                                        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${rule.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-6 p-6">
                        {selectedTemplateRule && (
                            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Template rule</p>
                                        <h3 className="mt-1 text-xl font-black text-[#002C4B] dark:text-white">{selectedTemplateRule.label}</h3>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => updateTemplateRule(selectedTemplateRule.templateId, { enabled: !selectedTemplateRule.enabled })}
                                        className={`relative h-8 w-14 rounded-full transition-colors ${selectedTemplateRule.enabled ? 'bg-[#ffbc03]' : 'bg-slate-300 dark:bg-slate-700'}`}
                                        title={selectedTemplateRule.enabled ? 'Disable template guidance' : 'Enable template guidance'}
                                    >
                                        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${selectedTemplateRule.enabled ? 'translate-x-7' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                                    <div>
                                        <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Template label</label>
                                        <input
                                            value={selectedTemplateRule.label}
                                            onChange={event => updateTemplateRule(selectedTemplateRule.templateId, { label: event.target.value })}
                                            className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Template ID</label>
                                        <input
                                            value={selectedTemplateRule.templateId}
                                            disabled
                                            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950"
                                        />
                                    </div>
                                    <div className="lg:col-span-2">
                                        <label className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Reviewer guidance</label>
                                        <textarea
                                            value={selectedTemplateRule.focus}
                                            onChange={event => updateTemplateRule(selectedTemplateRule.templateId, { focus: event.target.value })}
                                            rows={3}
                                            className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-950"
                                        />
                                    </div>
                                </div>

                                <div className="mt-6 grid gap-5 lg:grid-cols-2">
                                    {[
                                        ['priorityFields', 'Priority fields', templatePriorityFieldDraft, setTemplatePriorityFieldDraft],
                                        ['evidenceFields', 'Evidence focus fields', templateEvidenceFieldDraft, setTemplateEvidenceFieldDraft],
                                    ].map(([fieldType, label, draft, setDraft]) => (
                                        <div key={fieldType as string} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                                            <p className="text-sm font-black text-[#002C4B] dark:text-white">{label as string}</p>
                                            <div className="mt-3 flex gap-2">
                                                <select
                                                    value={draft as string}
                                                    onChange={event => (setDraft as React.Dispatch<React.SetStateAction<string>>)(event.target.value)}
                                                    className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-900"
                                                >
                                                    <option value="">Choose field</option>
                                                    {assessFieldOptions.map(field => (
                                                        <option key={field.id} value={field.id}>{field.section} / {field.label}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => addTemplateField(fieldType as 'priorityFields' | 'evidenceFields', draft as string)}
                                                    className="rounded-xl bg-[#002C4B] px-4 py-2 text-sm font-black text-white"
                                                >
                                                    Add
                                                </button>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {selectedTemplateRule[fieldType as 'priorityFields' | 'evidenceFields'].map(fieldId => {
                                                    const field = assessFieldOptions.find(option => option.id === fieldId);
                                                    return (
                                                        <button
                                                            key={fieldId}
                                                            type="button"
                                                            onClick={() => removeTemplateField(fieldType as 'priorityFields' | 'evidenceFields', fieldId)}
                                                            className="rounded-full border border-[#ffbc03]/40 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#002C4B] shadow-sm dark:bg-slate-900 dark:text-[#ffcf45]"
                                                            title="Click to remove"
                                                        >
                                                            {field?.label || fieldId} x
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="grid gap-6 xl:grid-cols-2">
                            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Reviewer workflow</p>
                                <h3 className="mt-1 text-lg font-black text-[#002C4B] dark:text-white">Section checkpoints</h3>
                                <div className="mt-4 space-y-3">
                                    {assessGovernanceConfig.reviewerCheckpoints.map(checkpoint => (
                                        <div key={checkpoint.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/70">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-black text-slate-900 dark:text-white">{checkpoint.label}</p>
                                                    <p className="mt-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{sectionLabelByKey[checkpoint.section]} / {checkpoint.requiredFor || 'review'}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => updateCheckpoint(checkpoint.id, { enabled: !checkpoint.enabled })}
                                                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checkpoint.enabled ? 'bg-[#ffbc03]' : 'bg-slate-300 dark:bg-slate-700'}`}
                                                >
                                                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checkpoint.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                </button>
                                            </div>
                                            <textarea
                                                value={checkpoint.description}
                                                onChange={event => updateCheckpoint(checkpoint.id, { description: event.target.value })}
                                                rows={2}
                                                className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-900"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Evidence policy</p>
                                    <h3 className="mt-1 text-lg font-black text-[#002C4B] dark:text-white">Approval controls</h3>
                                    <div className="mt-4 grid gap-3">
                                        {[
                                            ['requireLinkedEvidenceForProtectedFields', 'Require linked evidence for protected scoring fields'],
                                            ['restrictedEvidenceNeedsReviewer', 'Restricted evidence requires reviewer attention'],
                                            ['lowConfidenceRequiresReviewer', 'Low confidence outputs require reviewer approval'],
                                            ['requireOwnerOnEvidence', 'Evidence entries require an owner'],
                                            ['requireOwnerOnAssumptions', 'Assumptions require an owner'],
                                        ].map(([key, label]) => (
                                            <label key={key} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-black text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                                <span>{label}</span>
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean((assessGovernanceConfig.evidencePolicy as any)[key])}
                                                    onChange={event => updateEvidencePolicy({ [key]: event.target.checked } as Partial<typeof assessGovernanceConfig.evidencePolicy>)}
                                                    className="h-5 w-5 accent-[#ffbc03]"
                                                />
                                            </label>
                                        ))}
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <label className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-black text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                                Minimum evidence items
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={assessGovernanceConfig.evidencePolicy.minEvidenceItemsForApproval}
                                                    onChange={event => updateEvidencePolicy({ minEvidenceItemsForApproval: Math.max(0, parseInt(event.target.value) || 0) })}
                                                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-900"
                                                />
                                            </label>
                                            <label className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-black text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                                Assumption review days
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={assessGovernanceConfig.evidencePolicy.assumptionReviewDaysDefault}
                                                    onChange={event => updateEvidencePolicy({ assumptionReviewDaysDefault: Math.max(1, parseInt(event.target.value) || 1) })}
                                                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#ffbc03] dark:border-slate-700 dark:bg-slate-900"
                                                />
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Capture taxonomy</p>
                                    <h3 className="mt-1 text-lg font-black text-[#002C4B] dark:text-white">Allowed evidence and assumption types</h3>
                                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">Keep this list tight so non-technical users pick from meaningful enterprise categories.</p>
                                    <div className="mt-4">
                                        <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Evidence types</p>
                                        <div className="flex flex-wrap gap-2">
                                            {EVIDENCE_TYPES.map(type => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => toggleEvidenceType(type)}
                                                    className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] ring-1 transition-colors ${assessGovernanceConfig.evidenceTypes.includes(type)
                                                        ? 'bg-[#002C4B] text-white ring-[#002C4B]'
                                                        : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-950 dark:ring-slate-800'
                                                    }`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="mt-5">
                                        <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-slate-400">Assumption categories</p>
                                        <div className="flex flex-wrap gap-2">
                                            {ASSUMPTION_CATEGORIES.map(category => (
                                                <button
                                                    key={category}
                                                    type="button"
                                                    onClick={() => toggleAssumptionCategory(category)}
                                                    className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] ring-1 transition-colors ${assessGovernanceConfig.assumptionCategories.includes(category)
                                                        ? 'bg-[#ffbc03] text-[#002C4B] ring-[#ffbc03]'
                                                        : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-950 dark:ring-slate-800'
                                                    }`}
                                                >
                                                    {category}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
                </div>
            }
            usersRoles={
                <div className="space-y-6">
            {/* Role Management Stub */}
            <section className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Organization Members & Roles</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700/50 dark:text-slate-400">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg">User</th>
                                <th className="px-4 py-3">Platform Role</th>
                                <th className="px-4 py-3 rounded-tr-lg">Access Level</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentOrganization.members.map(member => (
                                <tr key={member.userId} className="border-b border-slate-100 dark:border-slate-700">
                                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                        {getUserName(member.userId)} {member.userId === currentUser.id ? '(You)' : ''}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-1 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-md text-xs font-medium">
                                            {member.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                                        {member.role === 'Admin' ? 'Full Configuration & Billing' :
                                            member.role === 'Buyer' ? 'Dashboard & Approvals View' :
                                                member.role === 'Contributor' ? 'Submit PDDs & Evidence' : 'Review Access'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
                </div>
            }
            auditSecurity={
                <div className="space-y-6">
            {/* Audit Log */}
            <section className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent Audit Log</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700/50 dark:text-slate-400">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg">Timestamp</th>
                                <th className="px-4 py-3">User</th>
                                <th className="px-4 py-3 rounded-tr-lg">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {auditLogs.slice(0, 5).map(log => (
                                <tr key={log.id} className="border-b border-slate-100 dark:border-slate-700">
                                    <td className="px-4 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-300">
                                        {getUserName(log.userId)}
                                    </td>
                                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                                        {log.action}
                                    </td>
                                </tr>
                            ))}
                            {auditLogs.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-4 py-8 text-center text-slate-500">No audit logs available.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
                </div>
            }
            aiControls={
                <section className="premium-surface rounded-3xl p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">AI Controls</p>
                            <h2 className="mt-1 text-xl font-black text-[#002C4B] dark:text-white">Server-side AI and BYOK direction</h2>
                            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                                Current governance documents keep provider resolution and BYOK controls on the server-side path. This section is a read-only pointer and does not add provider behavior, hosted control enforcement, or new security proof.
                            </p>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                            Direction only
                        </span>
                    </div>
                    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                        Server-side AI/BYOK direction is documented; no provider implementation, credential surface, runtime adapter, or hosted enforcement is introduced by this Admin Workbench slice.
                    </div>
                </section>
            }
        />
    );
};

export default OrganizationSetupView;
