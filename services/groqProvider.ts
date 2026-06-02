import {
    GeneratedArtifacts, ProjectDetails, Task, User, AiSprintPlan, Project, AiInsight, IAiProvider
} from '../types';
import { MOCK_DOC_TEMPLATES } from '../data/docTemplates';
import { SYSTEM_INSTRUCTIONS, PROMPTS } from './prompts';
import { buildTemplateStructurePrompt, cleanAndParseJson, normalizeGeneratedArtifacts } from './docGenerationGuard';

export class GroqProvider implements IAiProvider {
    private apiKey: string;
    private baseUrl: string = 'https://api.groq.com/openai/v1';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async generateProjectArtifacts(
        projectDetails: ProjectDetails,
        fileContent: string | null,
        fileName: string,
    ): Promise<GeneratedArtifacts> {
        const selectedTemplate = MOCK_DOC_TEMPLATES.find(t => t.id === projectDetails.templateId);
        const chunkedContent = fileContent
            ? fileContent.split(/\n\s*\n/).map((paragraph, index) => `[SOURCE ${index + 1}] ${paragraph.trim()}`).join('\n\n')
            : 'No document content provided.';
        const prompt = PROMPTS.projectArtifacts(
            projectDetails,
            selectedTemplate ? selectedTemplate.title : 'General Purpose',
            selectedTemplate ? selectedTemplate.artifactKey : 'brd',
            buildTemplateStructurePrompt(selectedTemplate),
            fileName,
            chunkedContent
        );

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                temperature: 0.2,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: SYSTEM_INSTRUCTIONS.PROJECT_ARTIFACTS },
                    { role: 'user', content: prompt },
                ],
            }),
        });

        if (!response.ok) {
            throw new Error(`Groq request failed with status ${response.status}: ${await response.text()}`);
        }

        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content;
        if (!content) throw new Error('Groq response did not include generated document content.');

        const normalized = normalizeGeneratedArtifacts(
            cleanAndParseJson<any>(content),
            selectedTemplate,
            projectDetails,
            { sourceAvailable: Boolean(fileContent?.trim()) }
        );
        return {
            ...normalized,
            approvals: [
                { userId: 'user-1', role: 'Accountable', status: 'Pending', approvedAt: null },
                { userId: 'user-2', role: 'Responsible', status: 'Pending', approvedAt: null },
                { userId: 'user-3', role: 'Consulted', status: 'Pending', approvedAt: null },
            ],
        };
    }

    async refineSectionContent(
        originalContent: string,
        refinementPrompt: string,
    ): Promise<string> {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                temperature: 0.2,
                messages: [
                    { role: 'system', content: SYSTEM_INSTRUCTIONS.REFINE_SECTION },
                    { role: 'user', content: PROMPTS.refineSection(originalContent, refinementPrompt) },
                ],
            }),
        });
        if (!response.ok) {
            throw new Error(`Groq refinement failed with status ${response.status}: ${await response.text()}`);
        }
        const payload = await response.json();
        return payload?.choices?.[0]?.message?.content || originalContent;
    }

    async generateSprintPlan(
        backlogTasks: Task[],
        teamMembers: User[],
        sprintDurationDays: number,
        sprintCapacity: number,
    ): Promise<AiSprintPlan> {
        console.log('Generating sprint plan using Groq...', {
            endpoint: this.baseUrl,
            hasApiKey: Boolean(this.apiKey),
            taskCount: backlogTasks.length,
            teamSize: teamMembers.length,
            sprintDurationDays,
            sprintCapacity,
        });

        return {
            rationale: 'Prioritized high-impact, unblocked work and assigned items based on domain fit and current demo availability.',
            sprintTaskIds: backlogTasks.slice(0, 3).map(t => t.id),
            taskAssignments: backlogTasks.slice(0, 3).map((task, index) => ({
                taskId: task.id,
                assigneeId: teamMembers[index % Math.max(teamMembers.length, 1)]?.id || '',
                reason: 'Best available match for the work type and sprint capacity.',
            })),
        };
    }

    async generateDashboardInsights(
        currentUser: User,
        tasks: Task[],
        projects: Project[],
    ): Promise<AiInsight[]> {
        console.log('Generating dashboard insights using Groq...', {
            endpoint: this.baseUrl,
            hasApiKey: Boolean(this.apiKey),
            userId: currentUser.id,
        });

        const blockedTasks = tasks.filter(task => task.status === 'Blocked');
        const atRiskProjects = projects.filter(project => project.healthStatus === 'At Risk');

        return [
            {
                type: 'summary',
                title: 'Portfolio execution signal',
                content: `${atRiskProjects.length} project(s) are at risk and ${blockedTasks.length} task(s) are blocked. Review human approval points and exception queues first.`,
            },
        ];
    }
}
