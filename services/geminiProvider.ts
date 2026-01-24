import { GoogleGenAI, Type } from "@google/genai";
import {
    GeneratedArtifacts, ProjectDetails, Task, User, AiSprintPlan, Project, AiInsight, IAiProvider
} from '../types';
import { MOCK_DOC_TEMPLATES } from '../data/docTemplates';
import { SYSTEM_INSTRUCTIONS, PROMPTS } from './prompts';

/**
 * Cleans and parses a JSON string that might be wrapped in markdown or have other extraneous text.
 * @param rawText The raw text response from the API.
 * @returns A parsed JSON object of type T.
 * @throws An error if the JSON is invalid after cleanup.
 */
function cleanAndParseJson<T>(rawText: string): T {
    let jsonText = rawText.trim();

    // Remove markdown code blocks if present
    const markdownRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = jsonText.match(markdownRegex);

    if (match && match[1]) {
        jsonText = match[1].trim();
    } else {
        // Fallback: Find the first '{' or '[' and last '}' or ']'
        const firstBrace = jsonText.indexOf('{');
        const firstBracket = jsonText.indexOf('[');
        const startIndex = firstBrace !== -1 && firstBracket !== -1
            ? Math.min(firstBrace, firstBracket)
            : Math.max(firstBrace, firstBracket);

        const lastBrace = jsonText.lastIndexOf('}');
        const lastBracket = jsonText.lastIndexOf(']');
        const endIndex = Math.max(lastBrace, lastBracket);

        if (startIndex !== -1 && endIndex !== -1) {
            jsonText = jsonText.substring(startIndex, endIndex + 1);
        }
    }

    try {
        return JSON.parse(jsonText);
    } catch (e: any) {
        console.error("Failed to parse Gemini JSON response:", e.message);
        console.error("Raw response text:", rawText);
        console.error("Cleaned response text that failed parsing:", jsonText);
        throw new Error(`Invalid JSON response from the API. Please check the console for details.`);
    }
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
    private ai: GoogleGenAI;

    constructor(apiKey: string) {
        this.ai = new GoogleGenAI({ apiKey });
    }

    async generateProjectArtifacts(
        projectDetails: ProjectDetails,
        fileContent: string | null,
        fileName: string,
    ): Promise<GeneratedArtifacts> {
        const selectedTemplate = MOCK_DOC_TEMPLATES.find(t => t.id === projectDetails.templateId);

        const templateStructurePrompt = selectedTemplate
            ? selectedTemplate.sections.map(s =>
                `  - Section Title: "${s.title}" (key: ${s.key})\n` +
                `    - Description: ${s.description}\n` +
                `    - AI Instructions: ${s.promptInjection || 'Generate content based on standard best practices for this section.'}`
            ).join('\n')
            : 'Default BRD/FRD/PDD structure.';

        // Chunk the source content for citation purposes
        const chunkedContent = fileContent
            ? fileContent.split(/\n\s*\n/).map((paragraph, index) => `[SOURCE ${index + 1}] ${paragraph.trim()}`).join('\n\n')
            : "No document content provided.";

        const prompt = PROMPTS.projectArtifacts(
            projectDetails,
            selectedTemplate ? selectedTemplate.title : 'General Purpose',
            templateStructurePrompt,
            fileName,
            chunkedContent
        );

        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_INSTRUCTIONS.PROJECT_ARTIFACTS,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        const parsedJson = cleanAndParseJson<any>(response.text);

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

        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_INSTRUCTIONS.REFINE_SECTION,
            },
        });

        return response.text;
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

        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_INSTRUCTIONS.SPRINT_PLAN,
                responseMimeType: "application/json",
                responseSchema: sprintPlanSchema,
            },
        });

        return cleanAndParseJson<AiSprintPlan>(response.text);
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

        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_INSTRUCTIONS.DASHBOARD_INSIGHTS,
                responseMimeType: "application/json",
                responseSchema: insightsSchema,
            },
        });

        return cleanAndParseJson<AiInsight[]>(response.text);
    }
}
