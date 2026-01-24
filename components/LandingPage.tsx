import React, { useState, useRef, useCallback } from 'react';
import { ProjectDetails, DocTemplate, AiProviderType } from '../types';
import { UploadCloudIcon, FileIcon, XIcon, SparklesIcon, CogIcon, ChevronDownIcon, KeyIcon } from './icons';

interface LandingPageProps {
  docTemplates: DocTemplate[];
  onProjectCreate: (projectDetails: ProjectDetails, file: File | null) => void;
  onCancel: () => void;
  userApiKey: string;
  onUserApiKeyChange: (key: string) => void;
  aiProviderType: AiProviderType;
  onAiProviderTypeChange: (provider: AiProviderType) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ docTemplates, onProjectCreate, onCancel, userApiKey, onUserApiKeyChange, aiProviderType, onAiProviderTypeChange }) => {
  const [projectDetails, setProjectDetails] = useState<ProjectDetails>({
    company: 'ACME Corp',
    project: 'New Customer Portal',
    domain: 'Software Development',
    templateId: docTemplates[0]?.id || '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProjectDetails(prev => ({ ...prev, [name]: value }));
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        setFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onProjectCreate(projectDetails, file);
  };
  
  const selectedTemplate = docTemplates.find(t => t.id === projectDetails.templateId);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-bold text-text-light dark:text-text-dark">Start a New Generation</h2>
        <p className="mt-2 text-lg text-slate-600 dark:text-slate-300">
            Follow the steps below to configure and generate your project documentation.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-surface-dark p-8 sm:p-10 rounded-3xl shadow-elev2 border border-slate-200 dark:border-gray-700 space-y-12">
        
        {/* Step 1 */}
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-abz-primary text-white font-bold text-lg">1</div>
                <div>
                    <h3 className="text-xl font-bold">Document Setup</h3>
                    <p className="text-slate-500 dark:text-slate-400">Choose your template to get started.</p>
                </div>
            </div>
            <div className="pl-14 space-y-6">
                 <div>
                    <label htmlFor="templateId" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Document Template</label>
                    <select name="templateId" id="templateId" value={projectDetails.templateId} onChange={handleInputChange} className="block w-full px-3 py-2 bg-white dark:bg-abz-ink-900 border border-slate-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-abz-primary focus:border-abz-primary">
                        {docTemplates.map(template => (
                            <option key={template.id} value={template.id}>{template.title}</option>
                        ))}
                    </select>
                    {selectedTemplate && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{selectedTemplate.description}</p>}
                </div>
            </div>
        </div>

        <div className="border-t border-slate-200 dark:border-gray-700 -mx-10"></div>

        {/* Step 2 */}
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-abz-primary text-white font-bold text-lg">2</div>
                <div>
                    <h3 className="text-xl font-bold">Project Context</h3>
                    <p className="text-slate-500 dark:text-slate-400">Provide basic details about the company and project.</p>
                </div>
            </div>
             <div className="pl-14">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="company" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Company</label>
                        <input type="text" name="company" id="company" value={projectDetails.company} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-abz-ink-900 border border-slate-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-abz-primary focus:border-abz-primary" />
                    </div>
                    <div>
                        <label htmlFor="project" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Project</label>
                        <input type="text" name="project" id="project" value={projectDetails.project} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-abz-ink-900 border border-slate-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-abz-primary focus:border-abz-primary" />
                    </div>
                </div>
                <div className="mt-6">
                    <label htmlFor="domain" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Domain / Industry</label>
                    <input type="text" name="domain" id="domain" value={projectDetails.domain} onChange={handleInputChange} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-abz-ink-900 border border-slate-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-abz-primary focus:border-abz-primary" placeholder="e.g., Finance, Healthcare, E-commerce" />
                </div>
            </div>
        </div>

        {/* Advanced Options */}
        <div className="border-t border-slate-200 dark:border-gray-700 -mx-10"></div>
        <div className="space-y-6">
            <button type="button" onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} className="flex items-center gap-4 w-full text-left">
                <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-slate-500 text-white font-bold text-lg">
                    <CogIcon className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-xl font-bold">Advanced Options</h3>
                    <p className="text-slate-500 dark:text-slate-400">Optional: Provide your own AI provider and API Key.</p>
                </div>
                <ChevronDownIcon className={`w-5 h-5 ml-auto transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
            </button>
            {isAdvancedOpen && (
                <div className="pl-14 space-y-6">
                    <div>
                        <label htmlFor="aiProviderType" className="block text-sm font-medium text-slate-700 dark:text-slate-300">AI Provider</label>
                         <select name="aiProviderType" id="aiProviderType" value={aiProviderType} onChange={(e) => onAiProviderTypeChange(e.target.value as AiProviderType)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-abz-ink-900 border border-slate-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-abz-primary focus:border-abz-primary">
                            <option value="gemini">Google Gemini</option>
                            <option value="openai">OpenAI</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="userApiKey" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                           {aiProviderType === 'gemini' ? 'Google AI Studio' : 'OpenAI'} API Key ({aiProviderType === 'gemini' ? 'Optional' : 'Required'})
                        </label>
                        <div className="relative mt-1">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <KeyIcon className="h-5 w-5 text-gray-400" />
                            </div>
                            <input type="password" name="userApiKey" id="userApiKey" value={userApiKey} onChange={(e) => onUserApiKeyChange(e.target.value)} className="block w-full pl-10 pr-3 py-2 bg-white dark:bg-abz-ink-900 border border-slate-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-abz-primary focus:border-abz-primary" placeholder="Enter your key to use your own account" />
                        </div>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">If you provide your own key, it will be used for this session instead of the default. Your key is not stored on our servers.</p>
                    </div>
                </div>
            )}
        </div>
        
        <div className="border-t border-slate-200 dark:border-gray-700 -mx-10"></div>

        {/* Step 3 */}
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-abz-primary text-white font-bold text-lg">3</div>
                <div>
                    <h3 className="text-xl font-bold">Source Material</h3>
                    <p className="text-slate-500 dark:text-slate-400">Upload a transcript, meeting notes, or legacy document.</p>
                </div>
            </div>
             <div className="pl-14">
                <div 
                    className={`drop-zone flex flex-col items-center justify-center p-6 text-center cursor-pointer min-h-[200px] ${isDraggingOver ? 'is-dragging-over' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".txt,.md,.pdf,.docx" />
                    {!file ? (
                    <>
                        <UploadCloudIcon className="w-12 h-12 mx-auto text-slate-400 dark:text-slate-500" />
                        <p className="mt-2 text-md font-semibold text-slate-700 dark:text-slate-300">
                          <span className="text-abz-primary">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">Transcript, meeting notes, legacy doc, etc.</p>
                    </>
                    ) : (
                        <div className="w-full text-center">
                            <FileIcon className="w-12 h-12 mx-auto text-abz-primary" />
                            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{file.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{(file.size / 1024).toFixed(2)} KB</p>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setFile(null); if(fileInputRef.current) fileInputRef.current.value = ''; }}
                                className="mt-2 inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded-lg shadow-sm text-red-700 bg-red-100 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900"
                            >
                                <XIcon className="w-3 h-3 mr-1" />
                                Remove
                            </button>
                    </div>
                    )}
                </div>
            </div>
        </div>


        <div className="pt-8 flex flex-col-reverse sm:flex-row items-center justify-end gap-4">
            <button
                type="button"
                onClick={onCancel}
                className="w-full sm:w-auto px-6 py-3 text-md font-semibold rounded-2xl focus:outline-none focus:ring-3 focus:ring-slate-400 btn-ghost"
            >
                Cancel
            </button>
            <button
                type="submit"
                className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3 text-md font-semibold btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <SparklesIcon className="w-6 h-6" />
                Generate Documents
            </button>
        </div>
      </form>
    </div>
  );
};

export default LandingPage;