import { DocTemplate, GeneratedArtifacts, ProjectDetails } from '../types';

interface NormalizeOptions {
    sourceAvailable?: boolean;
}

export function cleanAndParseJson<T>(rawText: string): T {
    const text = rawText.trim();

    try {
        return JSON.parse(text);
    } catch {
        // Continue with extraction strategies below.
    }

    const jsonFence = text.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonFence?.[1]) {
        return JSON.parse(jsonFence[1].trim());
    }

    const findBalancedJsonCandidate = () => {
        const start = (() => {
            const objectStart = text.indexOf('{');
            const arrayStart = text.indexOf('[');
            if (objectStart === -1) return arrayStart;
            if (arrayStart === -1) return objectStart;
            return Math.min(objectStart, arrayStart);
        })();
        if (start === -1) return '';

        const opening = text[start];
        const closing = opening === '{' ? '}' : ']';
        const stack = [closing];
        let inString = false;
        let escaped = false;

        for (let index = start + 1; index < text.length; index += 1) {
            const char = text[index];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (inString) continue;

            if (char === '{') stack.push('}');
            if (char === '[') stack.push(']');

            if (char === '}' || char === ']') {
                if (char !== stack[stack.length - 1]) return '';
                stack.pop();
                if (stack.length === 0) {
                    return text.slice(start, index + 1);
                }
            }
        }

        return '';
    };

    const candidate = findBalancedJsonCandidate();
    if (candidate) {
        return JSON.parse(candidate);
    }

    throw new Error('AI provider returned non-JSON content. Regenerate the document or switch providers.');
}

export const buildTemplateStructurePrompt = (template?: DocTemplate) =>
    template
        ? template.sections.map(section =>
            `  - Section Title: "${section.title}" (key: ${section.key})\n` +
            `    - Required: ${section.required === false ? 'No' : 'Yes'}\n` +
            `    - Description: ${section.description}\n` +
            `    - AI Instructions: ${section.promptInjection || 'Generate content based on the source material and standard enterprise documentation practice.'}`
        ).join('\n')
        : 'Default BRD/FRD/PDD structure.';

const emptyDocument = (title: string) => ({ title, sections: [] });

const standardWorkItems = (projectDetails: ProjectDetails) => [
    {
        type: 'Epic' as const,
        title: `Baseline discovery and operating model for ${projectDetails.project || 'target process'}`,
        description: 'Validate the generated industry baseline with SMEs, confirm process scope, and agree the target automation or workflow operating model.',
        acceptanceCriteria: [
            'Process owner validates the baseline draft',
            'In-scope and out-of-scope steps are confirmed',
            'Open assumptions are converted into decision items',
        ],
    },
    {
        type: 'Story' as const,
        title: 'Capture source evidence and exception scenarios',
        description: 'Collect SOPs, walkthrough notes, sample transactions, screenshots, and known exception examples to replace assumptions with evidence-backed requirements.',
        acceptanceCriteria: [
            'At least one source artifact is attached',
            'Known exceptions are documented with owner and handling path',
            'Quality Gate gaps are updated after evidence review',
        ],
    },
    {
        type: 'Story' as const,
        title: 'Define to-be process, controls, and HITL checkpoints',
        description: 'Confirm the future-state process map, automation boundaries, control points, and human-in-the-loop review steps.',
        acceptanceCriteria: [
            'To-be process map is approved by BA and process owner',
            'Human review steps are explicitly named',
            'Audit and reporting requirements are documented',
        ],
    },
    {
        type: 'Task' as const,
        title: 'Prepare UAT-ready backlog from approved document sections',
        description: 'Convert validated document sections into implementation tasks, test scenarios, and release-readiness checks.',
        acceptanceCriteria: [
            'Implementation tasks have owners and acceptance criteria',
            'UAT scenarios cover standard and exception paths',
            'Approval readiness is visible to the project manager',
        ],
    },
];

const normalizeLookupKey = (value?: string) =>
    (value || '')
        .toLowerCase()
        .replace(/^\s*\d+(?:\.\d+)*\s*/, '')
        .replace(/[^a-z0-9]+/g, '');

const standardMermaid = (projectDetails: ProjectDetails, toBe = false) => {
    const processName = projectDetails.project || 'Target Process';
    if (toBe) {
        return `flowchart TD
    A["Trigger: ${processName} request received"] --> B["Validate input data and business rules"]
    B --> C{"Straight-through eligible?"}
    C -- "Yes" --> D["Automation/API/workflow executes standard transaction"]
    C -- "No" --> E["Human reviews exception with guided checklist"]
    D --> F["Update system of record and audit log"]
    E --> F
    F --> G["Notify stakeholders and monitor SLA"]`;
    }

    return `flowchart TD
    A["Request or source document received"] --> B["Manual review and data capture"]
    B --> C["Validate against business rules"]
    C --> D{"Exception found?"}
    D -- "Yes" --> E["Route to SME or process owner"]
    D -- "No" --> F["Update downstream system"]
    E --> F
    F --> G["Send confirmation and retain evidence"]`;
};

const assumptionIntro = (projectDetails: ProjectDetails, sectionTitle: string, sourceAvailable: boolean) =>
    sourceAvailable
        ? `> **Needs validation:** KlarityPM generated this fallback section because the AI output did not map cleanly to **${sectionTitle}**. Validate it against the uploaded source before approval.`
        : `> **Industry baseline starter draft:** No support material was uploaded. KlarityPM generated this section from common ${projectDetails.domain || 'enterprise process'} practices for **${projectDetails.project || 'the selected process'}**. Review and tailor before approval.`;

const createStandardSectionContent = (section: DocTemplate['sections'][number], projectDetails: ProjectDetails, sourceAvailable: boolean) => {
    const title = section.title.toLowerCase();
    const project = projectDetails.project || 'Target Process';
    const domain = projectDetails.domain || 'Enterprise Operations';
    const company = projectDetails.company || 'the organization';
    const intro = assumptionIntro(projectDetails, section.title, sourceAvailable);

    if (title.includes('purpose')) {
        return `${intro}

This document defines the target business process and operating expectations for **${project}** at **${company}**. It is intended to align process owners, business analysts, automation developers, QA reviewers, and approvers on scope, controls, exception handling, and delivery handoff readiness.`;
    }

    if (title.includes('objective') || title.includes('success')) {
        return `${intro}

- Reduce manual handling effort for standard transactions by 50-80% after stabilization.
- Improve first-pass quality by enforcing data validation, exception routing, and audit logging.
- Shorten cycle time by routing standard cases through automation or workflow and reserving human effort for judgment-heavy exceptions.
- Provide traceable documentation, approval evidence, and delivery-ready backlog items.
- Establish measurable KPIs: cycle time, exception rate, rework rate, SLA adherence, automation success rate, and human review volume.`;
    }

    if (title.includes('contact') || title.includes('stakeholder') || title.includes('distribution')) {
        return `${intro}

| Role | Name / Group | Responsibility | Notes |
| --- | --- | --- | --- |
| Executive Sponsor | To be assigned | Own business outcome, budget, and priority decisions | Required for approval |
| Process Owner | To be assigned | Own process policy, exceptions, and sign-off | Confirms operating model |
| Business Analyst | To be assigned | Maintains requirements, process maps, and acceptance criteria | Coordinates clarifications |
| Automation / Solution Lead | To be assigned | Designs technical approach and implementation plan | Confirms feasibility |
| QA / UAT Lead | To be assigned | Defines and executes validation approach | Confirms release readiness |
| Operations SME | To be assigned | Validates edge cases and day-to-day work reality | Required for exception catalog |`;
    }

    if (title.includes('prerequisite')) {
        return `${intro}

1. Named process owner and SME availability for walkthroughs, exception review, and UAT.
2. Access to test environments, sample data, business rules, and system credentials.
3. Approved process scope, out-of-scope list, and exception handling policy.
4. Defined security, audit, retention, and human-in-the-loop requirements.
5. Delivery backlog accepted by the project manager and implementation team.
6. UAT entry and exit criteria agreed before development begins.`;
    }

    if (title.includes('overview') || title.includes('metrics')) {
        return `${intro}

| Field | Baseline Starter Value |
| --- | --- |
| Process full name | ${project} |
| Process area | ${domain} |
| Department | Operations / Shared Services |
| Short description | Receive, validate, process, and close a business transaction with exception handling and audit evidence. |
| Primary roles | Requestor, operations processor, SME reviewer, process owner, QA/UAT reviewer |
| Frequency | Daily or event-driven |
| Average handling time | To be confirmed during discovery |
| Input data | Email, form, spreadsheet, PDF, portal request, or upstream system record |
| Output data | Updated system record, notification, audit log, exception queue item, and management report |`;
    }

    if (title.includes('application') || title.includes('system')) {
        return `${intro}

| Application Name | Access Method | Purpose in Process | Automation Consideration |
| --- | --- | --- | --- |
| Email / Collaboration Inbox | Web/Desktop | Receives requests, attachments, and clarifications | Candidate for intake automation |
| Source Portal or Form | Web/API | Captures structured request data | Prefer API where available |
| System of Record | Web/Desktop/API | Stores transaction outcome and status | Requires access, audit, and validation rules |
| Spreadsheet / Shared Drive | File | May contain working trackers or reference data | Should be reduced or controlled |
| Reporting Dashboard | Web/BI | Tracks SLA, exceptions, and throughput | Feed with automation logs |`;
    }

    if (title.includes('as-is') && title.includes('map')) {
        return `${intro}

\`\`\`mermaid
${standardMermaid(projectDetails, false)}
\`\`\``;
    }

    if (title.includes('to-be') && title.includes('map')) {
        return `${intro}

\`\`\`mermaid
${standardMermaid(projectDetails, true)}
\`\`\``;
    }

    if (title.includes('step')) {
        return `${intro}

1. Request or source document is received through the agreed intake channel.
2. Operations user reviews the request, validates completeness, and identifies the transaction type.
3. Required data is captured or copied into the working system.
4. Business rules are checked against available reference data.
5. Exceptions are routed to SME, process owner, or requester for clarification.
6. Valid transactions are completed in the system of record.
7. Confirmation is sent and evidence is retained for audit.
8. Daily or weekly metrics are reviewed for SLA, rework, and exception trends.`;
    }

    if (title.includes('input data') || title.includes('data description') || title.includes('data requirement')) {
        return `${intro}

| Input Type | Source / Location | Structured? | Key Data | Validation Needed |
| --- | --- | --- | --- | --- |
| Request record | Email, portal, or workflow queue | Partial | Request ID, requester, date, transaction type | Required fields and duplicate check |
| Supporting document | PDF, Excel, or attachment | Partial | Amounts, IDs, dates, reference numbers | Format, completeness, and consistency |
| Master/reference data | System of record or controlled file | Yes | Customer/vendor/employee/project data | Active status and ownership |
| Approval evidence | Email, workflow approval, or ticket | Partial | Approver, timestamp, decision | Authority and audit retention |`;
    }

    if (title.includes('in scope')) {
        return `${intro}

- Standard intake, classification, and validation of ${project} transactions.
- Data extraction and entry for rule-based fields.
- Business-rule validation and duplicate checks.
- Exception queue creation for incomplete, ambiguous, or high-risk cases.
- System-of-record update for approved standard cases.
- Audit logging, status reporting, and operational dashboard feeds.`;
    }

    if (title.includes('out of scope')) {
        return `${intro}

| Activity / Step | Reason for Being Out of Scope | Impact |
| --- | --- | --- |
| Policy decisions without approved rules | Requires accountable business ownership | Route to process owner |
| Complex negotiations or judgment-heavy exceptions | Human expertise required | Keep human-in-the-loop |
| Unapproved system changes | Requires IT governance and release planning | Track as dependency |
| Historical data cleanup | Separate remediation workstream | Capture as future backlog item |`;
    }

    if (title.includes('exception') || title.includes('error')) {
        return `${intro}

| Exception Type | Trigger | Recommended Handling | Owner |
| --- | --- | --- | --- |
| Missing required data | Mandatory field is blank or unreadable | Create exception task and notify requester | Operations |
| Business rule mismatch | Amount, status, or reference value fails validation | Route to SME for decision | SME / Process Owner |
| Duplicate transaction | Matching ID or reference already exists | Stop processing and request confirmation | Operations |
| System unavailable | Target application cannot be reached | Retry, log incident, and notify support | IT Support |
| Unclassified case | No rule matches the scenario | Escalate to process owner and update rule catalog | Process Owner |`;
    }

    if (title.includes('report')) {
        return `${intro}

| Report / Metric | Frequency | Purpose |
| --- | --- | --- |
| Transaction volume | Daily / Weekly | Track demand and staffing impact |
| Automation success rate | Daily | Monitor straight-through processing |
| Exception rate by reason | Daily / Weekly | Identify process and data quality issues |
| Average handling time | Weekly | Validate efficiency improvement |
| SLA adherence | Daily / Weekly | Monitor business commitments |
| Audit log completeness | Weekly / Monthly | Confirm governance readiness |`;
    }

    if (title.includes('source')) {
        return `${intro}

| Source Type | Status | Notes |
| --- | --- | --- |
| Process walkthrough | Not uploaded | Recommended before approval |
| SOP / desktop procedure | Not uploaded | Add to improve step accuracy |
| Sample transaction data | Not uploaded | Add to validate fields and exceptions |
| System screenshots or recording | Not uploaded | Add to support automation design |
| Approval policy | Not uploaded | Add to confirm governance and HITL controls |`;
    }

    if (title.includes('assumption') || title.includes('constraint') || title.includes('risk')) {
        return `${intro}

**Assumptions**
- The process has enough repeatable volume to justify structured delivery.
- Standard cases can be described through deterministic business rules.
- SMEs are available to validate edge cases and UAT scenarios.

**Constraints / Risks**
- Lack of source documentation may hide important exceptions or compliance rules.
- System access, API availability, and data quality must be validated before automation commitment.
- Any high-risk decision should remain human-reviewed until governance approval is complete.`;
    }

    return `${intro}

${section.promptInjection || section.description}

Recommended starter content for **${project}**:
- Define the expected business outcome and owner for this section.
- Capture the current known standard process, exceptions, and required controls.
- Identify where automation, AI assistance, workflow, or human review is appropriate.
- Mark open questions for SME validation before approval.
- Convert confirmed decisions into delivery-ready backlog items.`;
};

const normalizeDocumentSections = (rawDocument: any, template: DocTemplate, projectDetails: ProjectDetails, options: NormalizeOptions = {}) => {
    const rawSections = Array.isArray(rawDocument?.sections) ? rawDocument.sections : [];
    const byKey = new Map<string, any>();
    rawSections.forEach((section: any) => {
        [section?.key, section?.title, normalizeLookupKey(section?.key), normalizeLookupKey(section?.title)]
            .filter(Boolean)
            .forEach(key => byKey.set(String(key), section));
    });
    const missingKeys: string[] = [];

    const sections = template.sections.map(templateSection => {
        const generated = (
            byKey.get(templateSection.key) ||
            byKey.get(templateSection.title) ||
            byKey.get(normalizeLookupKey(templateSection.key)) ||
            byKey.get(normalizeLookupKey(templateSection.title))
        ) as any;
        if (generated?.content?.trim()) {
            return {
                key: templateSection.key,
                title: generated.title || templateSection.title,
                content: generated.content,
                citations: Array.isArray(generated.citations) ? generated.citations : [],
            };
        }

        missingKeys.push(templateSection.key);
        return {
            key: templateSection.key,
            title: templateSection.title,
            content: createStandardSectionContent(templateSection, projectDetails, Boolean(options.sourceAvailable)),
            citations: [],
        };
    });

    return {
        document: {
            title: rawDocument?.title || `${template.title}: ${projectDetails.project}`,
            sections,
        },
        missingKeys,
    };
};

export function normalizeGeneratedArtifacts(raw: any, template: DocTemplate | undefined, projectDetails: ProjectDetails, options: NormalizeOptions = {}): GeneratedArtifacts {
    const artifacts: GeneratedArtifacts = {
        brd: raw?.brd || emptyDocument('Business Requirements Document'),
        frd: raw?.frd || emptyDocument('Functional Requirements Document'),
        pdd: raw?.pdd || emptyDocument('Process Design Document'),
        qualityGate: {
            title: raw?.qualityGate?.title || 'Quality Gate Analysis',
            ambiguityPoints: Array.isArray(raw?.qualityGate?.ambiguityPoints) ? raw.qualityGate.ambiguityPoints : [],
            gapPoints: Array.isArray(raw?.qualityGate?.gapPoints) ? raw.qualityGate.gapPoints : [],
        },
        diagrams: {
            asIs: {
                title: raw?.diagrams?.asIs?.title || 'As-Is Process Flow',
                mermaidCode: raw?.diagrams?.asIs?.mermaidCode || standardMermaid(projectDetails, false),
            },
            toBe: {
                title: raw?.diagrams?.toBe?.title || 'To-Be Process Flow',
                mermaidCode: raw?.diagrams?.toBe?.mermaidCode || standardMermaid(projectDetails, true),
            },
        },
        workItems: Array.isArray(raw?.workItems) && raw.workItems.length > 0 ? raw.workItems : standardWorkItems(projectDetails),
        approvals: Array.isArray(raw?.approvals) ? raw.approvals : [],
    };

    if (template) {
        const normalized = normalizeDocumentSections(artifacts[template.artifactKey], template, projectDetails, options);
        artifacts[template.artifactKey] = normalized.document;
        if (normalized.missingKeys.length > 0) {
            if (options.sourceAvailable) {
                artifacts.qualityGate.gapPoints = [
                    ...artifacts.qualityGate.gapPoints,
                    ...normalized.missingKeys.map(key => `Template section was completed from fallback baseline and needs source validation (${key})`),
                ];
            } else {
                artifacts.qualityGate.ambiguityPoints = [
                    ...artifacts.qualityGate.ambiguityPoints,
                    'No support material was uploaded. KlarityPM generated an industry baseline starter draft; all sections require SME/process-owner validation before approval.',
                ];
                artifacts.qualityGate.gapPoints = [
                    ...artifacts.qualityGate.gapPoints,
                    'Upload a process walkthrough, SOP, transcript, sample transactions, or system screenshots to convert this starter draft into evidence-backed documentation.',
                ];
            }
        }
    }

    return artifacts;
}
