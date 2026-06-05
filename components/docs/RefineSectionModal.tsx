import React, { useState, useEffect } from 'react';
import Modal from '../shared/Modal';
import { DocumentSection, AiProviderType } from '../../types';
import { aiOrchestrator } from '../../services/aiOrchestrator';
import { SparklesIcon } from '../shared/icons';

interface RefineSectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    section: DocumentSection | null;
    onSave: (newContent: string) => void;
    aiProviderType: AiProviderType;
}

const RefineSectionModal: React.FC<RefineSectionModalProps> = ({ isOpen, onClose, section, onSave, aiProviderType }) => {
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [refinedContent, setRefinedContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            // Reset state when modal is closed
            setPrompt('');
            setIsLoading(false);
            setRefinedContent(null);
            setError(null);
        }
    }, [isOpen]);

    const handleGenerate = async () => {
        if (!prompt || !section) return;
        setIsLoading(true);
        setError(null);
        setRefinedContent(null);
        try {
            const newContent = await aiOrchestrator.refineSection(
                aiProviderType, 
                section.title, 
                section.content, 
                prompt
            );
            setRefinedContent(newContent);
        } catch (e: any) {
            setError(`Failed to generate refined content. ${e.message}`);
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = () => {
        if (refinedContent) {
            onSave(refinedContent);
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Refine Section: ${section?.title}`}>
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Refinement Prompt</label>
                    <div className="flex gap-2">
                         <input
                            type="text"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="e.g., 'Make this more concise' or 'Add technical details'"
                            className="flex-grow input-field"
                            disabled={isLoading}
                        />
                        <button onClick={handleGenerate} disabled={!prompt || isLoading} className="btn-primary flex items-center gap-2">
                            <SparklesIcon className="w-5 h-5" />
                            {isLoading ? 'Generating...' : 'Generate'}
                        </button>
                    </div>
                </div>

                {error && <div className="p-3 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-sm">{error}</div>}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                        <h4 className="font-semibold mb-2">Original Content</h4>
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-abz-ink h-64 overflow-y-auto text-sm prose prose-sm max-w-none">
                            <div dangerouslySetInnerHTML={{ __html: window.marked ? window.marked.parse(section?.content || '') : (section?.content || '').replace(/\n/g, '<br />') }} />
                        </div>
                    </div>
                     <div>
                        <h4 className="font-semibold mb-2">Refined Content</h4>
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-abz-ink h-64 overflow-y-auto text-sm relative prose prose-sm max-w-none">
                            {isLoading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-surface-dark/50 z-10">
                                    <div className="relative w-8 h-8">
                                        <div className="absolute inset-0 border-2 border-abz-indigo-500/20 rounded-full"></div>
                                        <div className="absolute inset-0 border-t-2 border-abz-indigo-500 rounded-full animate-spin"></div>
                                    </div>
                                </div>
                            )}
                            {refinedContent && (
                                <div dangerouslySetInnerHTML={{ __html: window.marked ? window.marked.parse(refinedContent) : refinedContent.replace(/\n/g, '<br />') }} />
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-gray-700">
                    <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm font-semibold rounded-xl">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!refinedContent || isLoading}
                        className="btn-primary px-4 py-2 text-sm font-semibold rounded-xl"
                    >
                        Accept Changes
                    </button>
                </div>
            </div>
            <style>{`.input-field { background-color: white; border: 1px solid #d1d5db; border-radius: 0.5rem; padding: 0.5rem 0.75rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-field:focus { outline: 2px solid transparent; outline-offset: 2px; border-color: var(--abz-indigo-500); box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.3); } .dark .input-field { background-color: var(--abz-ink-900); border-color: #4b5563; }`}</style>
        </Modal>
    );
};

export default RefineSectionModal;
