import {
    GeneratedArtifacts, ProjectDetails, Task, User, AiSprintPlan, Project, AiInsight, IAiProvider
} from '../types';
import { MOCK_DOC_TEMPLATES } from '../data/docTemplates';
import { SYSTEM_INSTRUCTIONS, PROMPTS } from './prompts';
import { buildTemplateStructurePrompt, cleanAndParseJson, normalizeGeneratedArtifacts } from './docGenerationGuard';

const Type = {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    ARRAY: 'ARRAY',
} as const;

interface GeminiGenerateContentConfig {
    systemInstruction?: string;
    responseMimeType?: string;
    responseSchema?: unknown;
}

async function generateGeminiText(apiKey: string, prompt: string, config: GeminiGenerateContentConfig = {}) {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                systemInstruction: config.systemInstruction
                    ? { parts: [{ text: config.systemInstruction }] }
                    : undefined,
                generationConfig: {
                    responseMimeType: config.responseMimeType,
                    responseSchema: config.responseSchema,
                },
            }),
        }
    );

    if (!response.ok) {
        const message = await response.text();
        throw new Error(`Gemini request failed with status ${response.status}: ${message}`);
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || '')
        .join('');

    if (!text) {
        throw new Error('Gemini response did not include text content.');
    }

    return text;
}

const docSectionSchema = {
    type: Type.OBJECT,
    properties: {
        key: { type: Type.STRING, description: "A unique key for the section (e.g., 'introduction')." },
        title: { type: Type.STRING, description: "The title of the section (e.g., '1. Introduction')." },
        content: { type: Type.STRING, description: "The full content of the section in Markdown format. All double quotes within this string must be escaped." },
        citations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "An array of strings, where each string is a reference to the source chunk ID (e.g., '[SOURCE 5]') that supports the content of this section."
        }
    },
    required: ["key", "title", "content"]
};

const responseSchema = {
    type: Type.OBJECT,
    properties: {
        brd: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING, description: "The main title of the Business Requirements Document." },
                sections: { type: Type.ARRAY, items: docSectionSchema }
            },
            required: ["title", "sections"]
        },
        frd: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING, description: "The main title of the Functional Requirements Document." },
                sections: { type: Type.ARRAY, items: docSectionSchema }
            },
            required: ["title", "sections"]
        },
        pdd: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING, description: "The main title of the Process Design Document, focusing on automation." },
                sections: { type: Type.ARRAY, items: docSectionSchema }
            },
            required: ["title", "sections"]
        },
        qualityGate: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING, description: "Title for the Quality Gate Analysis section." },
                ambiguityPoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of ambiguous points. If a point refers to a specific section, include its 'key' in parentheses at the end of the string, e.g., 'What is the password policy? (user_auth)'." },
                gapPoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of missing information. If a gap refers to a specific section, include its 'key' in parentheses, e.g., 'Password recovery process is not defined (user_auth)'." }
            },
            required: ["title", "ambiguityPoints", "gapPoints"]
        },
        diagrams: {
            type: Type.OBJECT,
            properties: {
                asIs: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "Title for the 'As-Is' process flow diagram." },
                        mermaidCode: { type: Type.STRING, description: "Mermaid.js flowchart TD code for the 'As-Is' process. All double quotes inside this string must be escaped." }
                    },
                    required: ["title", "mermaidCode"]
                },
                toBe: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "Title for the 'To-Be' process flow diagram." },
                        mermaidCode: { type: Type.STRING, description: "Mermaid.js flowchart TD code for the 'To-Be' process. All double quotes inside this string must be escaped." }
                    },
                    required: ["title", "mermaidCode"]
                }
            },
            required: ["asIs", "toBe"]
        },
        workItems: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, enum: ["Epic", "Story", "Task"], description: "The type of work item." },
                    title: { type: Type.STRING, description: "The title of the work item." },
                    description: { type: Type.STRING, description: "The description for the work item. All double quotes within this string must be escaped." },
                    acceptanceCriteria: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: "A list of acceptance criteria for the story."
                    }
                },
                required: ["type", "title", "description", "acceptanceCriteria"]
            }
        }
    },
    required: ["brd", "frd", "pdd", "qualityGate", "diagrams", "workItems"]
};

const sprintPlanSchema = {
    type: Type.OBJECT,
    properties: {
        rationale: {
            type: Type.STRING,
            description: "A detailed explanation of the sprint plan, including why certain tasks were prioritized and how assignments were made based on skills and workload. Escape all double quotes."
        },
        sprintTaskIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "An array of task IDs that should be included in the sprint."
        },
        taskAssignments: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    taskId: { type: Type.STRING, description: "The ID of the task being assigned." },
                    assigneeId: { type: Type.STRING, description: "The ID of the user assigned to the task." },
                    reason: { type: Type.STRING, description: "A brief reason for assigning this task to this specific user (e.g., skill match, availability). Escape all double quotes." }
                },
                required: ["taskId", "assigneeId", "reason"]
            },
            description: "A list of specific task-to-user assignments for the sprint."
        }
    },
    required: ["rationale", "sprintTaskIds", "taskAssignments"]
};

const insightsSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            type: { type: Type.STRING, enum: ['risk', 'priority', 'summary', 'bottleneck'], description: "The category of the insight." },
            title: { type: Type.STRING, description: "A short, catchy title for the insight. Escape double quotes." },
            content: { type: Type.STRING, description: "The full, actionable insight text. Must be concise and written in a helpful, proactive tone. Escape double quotes." }
        },
        required: ["type", "title", "content"]
    }
};

export class GeminiProvider implements IAiProvider {
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async generateProjectArtifacts(
        projectDetails: ProjectDetails,
        fileContent: string | null,
        fileName: string,
    ): Promise<GeneratedArtifacts> {
        const selectedTemplate = MOCK_DOC_TEMPLATES.find(t => t.id === projectDetails.templateId);

        const templateStructurePrompt = buildTemplateStructurePrompt(selectedTemplate);

        // Chunk the source content for citation purposes
        const chunkedContent = fileContent
            ? fileContent.split(/\n\s*\n/).map((paragraph, index) => `[SOURCE ${index + 1}] ${paragraph.trim()}`).join('\n\n')
            : "No document content provided.";

        const prompt = PROMPTS.projectArtifacts(
            projectDetails,
            selectedTemplate ? selectedTemplate.title : 'General Purpose',
            selectedTemplate ? selectedTemplate.artifactKey : 'brd',
            templateStructurePrompt,
            fileName,
            chunkedContent
        );

        const text = await generateGeminiText(this.apiKey, prompt, {
            systemInstruction: SYSTEM_INSTRUCTIONS.PROJECT_ARTIFACTS,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
        });

        const parsedJson = normalizeGeneratedArtifacts(
            cleanAndParseJson<any>(text),
            selectedTemplate,
            projectDetails,
            { sourceAvailable: Boolean(fileContent?.trim()) }
        );

        const fullArtifacts: GeneratedArtifacts = {
            ...parsedJson,
            approvals: [
                { userId: 'user-1', role: 'Accountable', status: 'Pending', approvedAt: null },
                { userId: 'user-2', role: 'Responsible', status: 'Pending', approvedAt: null },
                { userId: 'user-3', role: 'Consulted', status: 'Pending', approvedAt: null },
            ],
        };

        return fullArtifacts;
    }


    async refineSectionContent(
        originalContent: string,
        refinementPrompt: string,
    ): Promise<string> {
        const prompt = PROMPTS.refineSection(originalContent, refinementPrompt);

        return generateGeminiText(this.apiKey, prompt, {
            systemInstruction: SYSTEM_INSTRUCTIONS.REFINE_SECTION,
        });
    }

    async generateSprintPlan(
        backlogTasks: Task[],
        teamMembers: User[],
        sprintDurationDays: number,
        sprintCapacity: number,
    ): Promise<AiSprintPlan> {

        const serializedTasks = backlogTasks.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            storyPoints: t.storyPoints,
            dependencyIds: t.dependencyIds,
            type: t.type
        }));

        const serializedUsers = teamMembers.map(u => ({
            id: u.id,
            name: u.name,
            skills: u.skills
        }));

        const prompt = PROMPTS.sprintPlan(
            sprintDurationDays,
            sprintCapacity,
            JSON.stringify(serializedUsers, null, 2),
            JSON.stringify(serializedTasks, null, 2)
        );

        const text = await generateGeminiText(this.apiKey, prompt, {
            systemInstruction: SYSTEM_INSTRUCTIONS.SPRINT_PLAN,
            responseMimeType: "application/json",
            responseSchema: sprintPlanSchema,
        });

        return cleanAndParseJson<AiSprintPlan>(text);
    }

    async generateDashboardInsights(
        currentUser: User,
        tasks: Task[],
        projects: Project[],
    ): Promise<AiInsight[]> {

        // Serialize only the necessary data to keep the prompt efficient
        const relevantTasks = tasks.filter(t => t.status !== 'Done').map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            assigneeIds: t.assigneeIds,
            projectId: t.projectId,
            dependencyIds: t.dependencyIds
        }));

        const prompt = PROMPTS.dashboardInsights(
            new Date().toLocaleDateString(),
            currentUser.name,
            currentUser.id,
            JSON.stringify(projects.map(p => ({ id: p.id, name: p.name, healthStatus: p.healthStatus })), null, 2),
            JSON.stringify(relevantTasks, null, 2)
        );

        const text = await generateGeminiText(this.apiKey, prompt, {
            systemInstruction: SYSTEM_INSTRUCTIONS.DASHBOARD_INSIGHTS,
            responseMimeType: "application/json",
            responseSchema: insightsSchema,
        });

        return cleanAndParseJson<AiInsight[]>(text);
    }
}
