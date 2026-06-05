import React, { useState } from 'react';
import LandingPage from '../shared/LandingPage';
import ProcessingView from '../assess/ProcessingView';
import { aiOrchestrator } from '../../services/aiOrchestrator';
import { GeneratedArtifacts, ProjectDetails, DocTemplate, Project, AiProviderType } from '../../types';

interface DocsForgeViewProps {
    project: Project | null;
    docTemplates: DocTemplate[];
    onCancel: () => void;
    onComplete: (projectDetails: ProjectDetails, artifacts: GeneratedArtifacts) => void;
    aiProviderType: AiProviderType;
    onAiProviderTypeChange: (provider: AiProviderType) => void;
}

const DocsForgeView: React.FC<DocsForgeViewProps> = ({ project, docTemplates, onCancel, onComplete, aiProviderType, onAiProviderTypeChange }) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const handleProjectCreate = async (projectDetails: ProjectDetails, file: File | null) => {
        setIsProcessing(true);
        
        try {
            let fileContent: string | null = null;
            if (file) {
                fileContent = await file.text();
            }
        
            const artifacts = await aiOrchestrator.generateArtifacts(
                aiProviderType, 
                projectDetails, 
                fileContent, 
                file?.name || "N/A"
            );
            onComplete(projectDetails, artifacts);

        } catch (err: any) {
            let errorMessage = `Error generating artifacts: ${err.message || "An unknown error occurred."}`;
            if (err.message?.includes("API key not valid") || err.message?.includes("403")) {
                 errorMessage = "Avala Studio could not complete generation with the selected settings. Review the settings and try again.";
            }
            console.error("Error generating artifacts:", err);
            alert(errorMessage);
            setIsProcessing(false);
        }
    };

    if (isProcessing) {
        return <ProcessingView />;
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <LandingPage 
                docTemplates={docTemplates} 
                onProjectCreate={handleProjectCreate} 
                onCancel={onCancel} 
                aiProviderType={aiProviderType}
                onAiProviderTypeChange={onAiProviderTypeChange}
            />
        </div>
    );
};

export default DocsForgeView;
