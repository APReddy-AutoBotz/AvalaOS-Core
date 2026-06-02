import { TemplatePack } from '../types';

export const FINANCE_PROCUREMENT_PACK: TemplatePack = {
    id: 'pack-finance-procurement-v1',
    name: 'Finance & Procurement',
    description: 'Standardized assessment templates for core financial operations, including P2P, O2C, and R2R.',
    isPremium: false,
    templates: [
        {
            id: 'tpl-p2p-invoice-ingestion',
            family: 'Procure-to-Pay (P2P)',
            name: 'Invoice Ingestion & Extraction',
            description: 'Evaluate the process of receiving vendor invoices and extracting line-item header data into the ERP.',
            defaultFields: {
                department: 'Finance',
                criticality: 'High'
            },
            protectedScoringFields: [
                'standardization',
                'rule_determinism',
                'unstructured_load',
                'system_readiness'
            ],
            defaultRisks: [
                'Vendor formatting variations cause OCR failures.',
                'Duplicate invoice submission from vendors.',
                'Missing PO matching leads to delayed payments.'
            ],
            recommendationHints: [
                'Consider GenAI for handling highly unstructured or multi-page email invoices.',
                'RPA is suitable if invoices are already standardized EDI/XML.'
            ],
            systemContextLayer: ['ERP System (e.g., SAP, Oracle)', 'Email Client', 'AP Inbox'],
            optionalCustomFields: [
                'Average Vendors per Month',
                'Invoice Volume Spikes'
            ]
        },
        {
            id: 'tpl-o2c-credit-check',
            family: 'Order-to-Cash (O2C)',
            name: 'Customer Credit Checking',
            description: 'Evaluate the process of validating customer credit profiles against internal policies and external bureaus before order approval.',
            defaultFields: {
                department: 'Finance',
                criticality: 'Critical'
            },
            protectedScoringFields: [
                'judgment_intensity',
                'risk_criticality',
                'exception_predictability'
            ],
            defaultRisks: [
                'Approving credit beyond safe limits causing bad debt.',
                'Delaying order fulfillment due to manual review bottlenecks.'
            ],
            recommendationHints: [
                'Workflow orchestration is ideal for routing exceptions to credit analysts.',
                'Agentic AI might determine complex borderline credit decisions if bounded carefully.'
            ],
            systemContextLayer: ['CRM (e.g., Salesforce)', 'Credit Bureau APIs', 'ERP System'],
            optionalCustomFields: [
                'External Data Costs',
                'Manual Review SLAs'
            ]
        }
    ]
};

export const HR_ONBOARDING_PACK: TemplatePack = {
    id: 'pack-hr-onboarding-v1',
    name: 'HR & Employee Onboarding',
    description: 'Evaluate employee lifecycle processes including onboarding, offboarding, and payroll changes. (Premium Pack)',
    isPremium: true,
    templates: [] // Stubbed for premium gating test
};

export const ALL_TEMPLATE_PACKS: TemplatePack[] = [
    FINANCE_PROCUREMENT_PACK,
    HR_ONBOARDING_PACK
];
