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
    userApiKey: string;
    aiProviderType: AiProviderType;
    onAiProviderTypeChange: (provider: AiProviderType) => void;
}

const DocsForgeView: React.FC<DocsForgeViewProps> = ({ project, docTemplates, onCancel, onComplete, userApiKey, aiProviderType, onAiProviderTypeChange }) => {
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
                userApiKey, 
                projectDetails, 
                fileContent, 
                file?.name || "N/A"
            );
            onComplete(projectDetails, artifacts);

        } catch (err: any) {
            let errorMessage = `Error generating artifacts: ${err.message || "An unknown error occurred."}`;
            if (userApiKey && (err.message?.includes("API key not valid") || err.message?.includes("403"))) {
                 errorMessage = "The custom API key you provided appears to be invalid. Please check the key and try again, or clear it to use the default key.";
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
