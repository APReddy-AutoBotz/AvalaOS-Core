import React, { useState, useEffect, useCallback } from 'react';
import { DocTemplate, TemplateSection, GeneratedArtifacts } from '../../types';
import { PlusCircleIcon, TrashIcon, GripVerticalIcon, EyeIcon, CodeBracketIcon, SparklesIcon } from '../shared/icons';

// Make js-yaml available globally from the script tag in index.html
declare const jsyaml: any;

interface TemplateEditorProps {
    template?: DocTemplate;
    onSave: (template: DocTemplate | Omit<DocTemplate, 'id'>) => void;
    onCancel: () => void;
}

type EditorView = 'visual' | 'yaml';

const TemplateEditor: React.FC<TemplateEditorProps> = ({ template, onSave, onCancel }) => {
    const [editedTemplate, setEditedTemplate] = useState<Omit<DocTemplate, 'id'> | DocTemplate>(
        template || {
            title: '',
            description: '',
            artifactKey: 'brd',
            sections: [],
        }
    );
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [view, setView] = useState<EditorView>('visual');
    const [yamlString, setYamlString] = useState('');
    const [yamlError, setYamlError] = useState<string | null>(null);

    // Sync from object to YAML string when switching to YAML view or when the base template changes
    useEffect(() => {
        if (jsyaml) {
            try {
                // When we switch to YAML, we generate the string from the current object state.
                // For new templates, we remove the placeholder ID from the YAML view to avoid confusion.
                const templateForYaml = { ...editedTemplate };
                if ('id' in templateForYaml && !template) {
                    delete (templateForYaml as any).id;
                }
                setYamlString(jsyaml.dump(templateForYaml, { indent: 2, skipInvalid: true }));
                setYamlError(null);
            } catch (e: any) {
                const errorMessage = `YAML Generation Error: ${e.message}`;
                setYamlString(errorMessage);
                setYamlError(errorMessage);
            }
        }
    }, [editedTemplate, template]);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEditedTemplate(prev => ({ ...prev, [name]: value }));
    };

    const handleYamlChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newYamlString = e.target.value;
        setYamlString(newYamlString);
        try {
            const parsed = jsyaml.load(newYamlString);
            // Basic validation
            if (typeof parsed !== 'object' || parsed === null || !parsed.title || !Array.isArray(parsed.sections)) {
                throw new Error("Invalid template structure. 'title' and 'sections' are required.");
            }
            
            const currentId = 'id' in editedTemplate ? editedTemplate.id : undefined;
            setEditedTemplate({ ...(currentId && { id: currentId }), ...parsed });
            setYamlError(null);
        } catch (e: any) {
            setYamlError(`Invalid YAML: ${e.message}`);
        }
    }, [editedTemplate]);


    const handleSectionChange = (index: number, field: keyof TemplateSection, value: string) => {
        const newSections = [...editedTemplate.sections];
        newSections[index] = { ...newSections[index], [field]: value };
        setEditedTemplate(prev => ({ ...prev, sections: newSections }));
    };

    const handleAddSection = () => {
        const newSection: TemplateSection = {
            key: `new_section_${Date.now()}`,
            title: 'New Section',
            description: 'A brief description of this section.',
            promptInjection: '',
        };
        setEditedTemplate(prev => ({ ...prev, sections: [...prev.sections, newSection] }));
    };

    const handleRemoveSection = (index: number) => {
        const newSections = editedTemplate.sections.filter((_, i) => i !== index);
        setEditedTemplate(prev => ({ ...prev, sections: newSections }));
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const newSections = [...editedTemplate.sections];
        const draggedItem = newSections.splice(draggedIndex, 1)[0];
        newSections.splice(index, 0, draggedItem);
        
        setDraggedIndex(index);
        setEditedTemplate(prev => ({ ...prev, sections: newSections }));
    };
    
    const handleDragEnd = () => {
        setDraggedIndex(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (yamlError) return;
        onSave(editedTemplate);
    };

    const artifactKeys: (keyof GeneratedArtifacts)[] = ['brd', 'frd', 'pdd'];
    
    const renderVisualEditor = () => (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label htmlFor="title" className="block text-sm font-medium">Template Title</label>
                    <input type="text" name="title" id="title" value={editedTemplate.title} onChange={handleInputChange} className="mt-1 block w-full input-field" required />
                </div>
                <div>
                    <label htmlFor="artifactKey" className="block text-sm font-medium">Target Artifact</label>
                    <select name="artifactKey" id="artifactKey" value={editedTemplate.artifactKey} onChange={handleInputChange} className="mt-1 block w-full input-field">
                        {artifactKeys.map(key => <option key={key} value={key}>{key.toUpperCase()}</option>)}
                    </select>
                </div>
            </div>
            <div>
                <label htmlFor="description" className="block text-sm font-medium">Description</label>
                <textarea name="description" id="description" value={editedTemplate.description} onChange={handleInputChange} rows={3} className="mt-1 block w-full input-field" />
            </div>

            <div>
                <h3 className="text-lg font-semibold mb-2">Sections</h3>
                <div className="space-y-4 p-4 bg-slate-50 dark:bg-abz-ink rounded-lg border border-slate-200 dark:border-gray-700">
                    {editedTemplate.sections.map((section, index) => (
                        <div 
                            key={index} 
                            className={`p-4 bg-white dark:bg-surface-dark rounded-lg border border-slate-300 dark:border-gray-600 flex gap-4 transition-shadow ${draggedIndex === index ? 'shadow-lg' : ''}`}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                        >
                            <div 
                                className="cursor-move pt-2 text-slate-400 hover:text-slate-600"
                                draggable="true"
                                onDragStart={(e) => handleDragStart(e, index)}
                            >
                                <GripVerticalIcon className="w-5 h-5" />
                            </div>
                            <div className="flex-grow space-y-2">
                                <div className="grid grid-cols-2 gap-4">
                                    <input type="text" placeholder="Section Title (e.g., Scope)" value={section.title} onChange={(e) => handleSectionChange(index, 'title', e.target.value)} className="input-field-sm" />
                                    <input type="text" placeholder="Section Key (e.g., scope)" value={section.key} onChange={(e) => handleSectionChange(index, 'key', e.target.value)} className="input-field-sm font-mono text-xs" />
                                </div>
                                <textarea placeholder="Section Description for user" value={section.description} onChange={(e) => handleSectionChange(index, 'description', e.target.value)} className="input-field-sm" rows={2} />
                                <div className="mt-2 p-3 bg-indigo-50 dark:bg-abz-indigo-700/20 rounded-lg animate-highlight-glow ring-1 ring-abz-indigo-500/20">
                                    <label className="flex items-center gap-1.5 text-xs font-semibold text-abz-indigo-600 dark:text-abz-indigo-300 mb-1">
                                        <SparklesIcon className="w-4 h-4" />
                                        AI PROMPT INJECTION (Your instructions for the AI)
                                    </label>
                                    <textarea 
                                        placeholder="e.g., Format this as a bulleted list. Be concise." 
                                        value={section.promptInjection || ''} 
                                        onChange={(e) => handleSectionChange(index, 'promptInjection', e.target.value)} 
                                        className="input-field-sm w-full"
                                        rows={2} 
                                    />
                                </div>
                            </div>
                            <button type="button" onClick={() => handleRemoveSection(index)} className="p-2 text-slate-400 hover:text-abz-danger self-start">
                                <TrashIcon className="w-5 h-5" />
                            </button>
                        </div>
                    ))}
                        <button type="button" onClick={handleAddSection} className="flex items-center gap-2 text-sm font-medium text-abz-primary mt-4">
                        <PlusCircleIcon className="w-5 h-5" />
                        Add Section
                    </button>
                </div>
            </div>
        </>
    );

    const renderYamlEditor = () => (
        <div>
            <textarea
                value={yamlString}
                onChange={handleYamlChange}
                className={`w-full h-96 font-mono text-sm p-4 rounded-lg border focus:outline-none focus:ring-2
                    ${yamlError ? 'border-abz-danger focus:ring-abz-danger' : 'border-slate-300 dark:border-gray-600 focus:ring-abz-primary'}
                    bg-slate-50 dark:bg-abz-ink`}
                spellCheck="false"
            />
            {yamlError && <div className="mt-2 text-sm text-abz-danger font-medium bg-abz-danger/10 p-3 rounded-lg">{yamlError}</div>}
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto">
             <div className="flex justify-between items-start mb-4">
                <h2 className="text-3xl font-bold">{template ? 'Edit Template' : 'Create New Template'}</h2>
                <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-abz-ink rounded-lg">
                    <button type="button" onClick={() => setView('visual')} className={`px-3 py-1.5 text-sm font-semibold rounded-md flex items-center gap-2 transition-colors ${view === 'visual' ? 'bg-white dark:bg-surface-dark shadow-sm text-abz-primary' : 'text-slate-500 hover:text-slate-800'}`}>
                        <EyeIcon className="w-5 h-5"/> Visual
                    </button>
                    <button type="button" onClick={() => setView('yaml')} className={`px-3 py-1.5 text-sm font-semibold rounded-md flex items-center gap-2 transition-colors ${view === 'yaml' ? 'bg-white dark:bg-surface-dark shadow-sm text-abz-primary' : 'text-slate-500 hover:text-slate-800'}`}>
                        <CodeBracketIcon className="w-5 h-5"/> YAML
                    </button>
                </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-surface-dark p-8 rounded-2xl shadow-soft border border-slate-200 dark:border-gray-700">
                
                {view === 'visual' ? renderVisualEditor() : renderYamlEditor()}

                <div className="flex justify-end gap-4 pt-6 border-t border-slate-200 dark:border-gray-700">
                    <button type="button" onClick={onCancel} className="px-6 py-2 text-md font-semibold rounded-2xl btn-ghost">Cancel</button>
                    <button type="submit" disabled={!!yamlError} className="px-6 py-2 text-md font-semibold rounded-2xl btn-primary">Save Template</button>
                </div>
            </form>
            <style>{`
                .input-field {
                    background-color: white;
                    border: 1px solid #d1d5db;
                    border-radius: 0.5rem;
                    padding: 0.5rem 0.75rem;
                    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
                }
                .input-field:focus {
                    outline: 2px solid transparent;
                    outline-offset: 2px;
                    border-color: var(--abz-indigo-500);
                    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.3);
                }
                .dark .input-field {
                    background-color: var(--abz-ink-900);
                    border-color: #4b5563;
                }
                .input-field-sm {
                     background-color: white;
                     border: 1px solid #d1d5db;
                     border-radius: 0.375rem;
                     padding: 0.5rem;
                     font-size: 0.875rem;
                     width: 100%;
                }
                .dark .input-field-sm {
                    background-color: var(--abz-ink-950);
                    border-color: #4b5563;
                }
                @keyframes highlight-glow {
                  0%, 100% {
                    box-shadow: 0 0 0 0px var(--abz-indigo-500-op, rgba(79, 70, 229, 0.2));
                  }
                  50% {
                    box-shadow: 0 0 0 5px var(--abz-indigo-500-op-zero, rgba(79, 70, 229, 0));
                  }
                }
                .animate-highlight-glow {
                    animation: highlight-glow 2.5s infinite ease-out;
                }
            `}</style>
        </div>
    );
};

export default TemplateEditor;
