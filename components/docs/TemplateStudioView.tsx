import React, { useState } from 'react';
import { DocTemplate } from '../../types';
import TemplateEditor from './TemplateEditor';
import { PlusCircleIcon, CodeBracketIcon, PencilIcon, TrashIcon, DocumentTextIcon, BoltIcon, ClipboardListIcon } from '../shared/icons';

interface TemplateStudioViewProps {
    templates: DocTemplate[];
    onCreate: (template: Omit<DocTemplate, 'id'>) => void;
    onUpdate: (template: DocTemplate) => void;
    onDelete: (templateId: string) => void;
}

const artifactIconMap: Record<string, React.FC<{className: string}>> = {
    brd: DocumentTextIcon,
    pdd: BoltIcon,
    frd: ClipboardListIcon,
    default: CodeBracketIcon,
};


const TemplateStudioView: React.FC<TemplateStudioViewProps> = ({ templates, onCreate, onUpdate, onDelete }) => {
    const [editingTemplate, setEditingTemplate] = useState<DocTemplate | null | 'new'>(null);

    const handleSave = (template: DocTemplate | Omit<DocTemplate, 'id'>) => {
        if ('id' in template) {
            onUpdate(template);
        } else {
            onCreate(template);
        }
        setEditingTemplate(null);
    };
    
    const handleDelete = (templateId: string) => {
        if (window.confirm('Are you sure you want to delete this template? This cannot be undone.')) {
            onDelete(templateId);
        }
    }

    if (editingTemplate) {
        return (
            <TemplateEditor 
                template={editingTemplate === 'new' ? undefined : editingTemplate}
                onSave={handleSave}
                onCancel={() => setEditingTemplate(null)}
            />
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold text-text-light dark:text-text-dark">Template Studio</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Create and manage your document generation templates.</p>
                </div>
                <button onClick={() => setEditingTemplate('new')} className="flex items-center gap-2 text-sm font-semibold btn-primary">
                    <PlusCircleIcon className="h-5 w-5" />
                    <span>New Template</span>
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map(template => {
                    const Icon = artifactIconMap[template.artifactKey] || artifactIconMap.default;
                    return (
                        <div key={template.id} className="card p-6 flex flex-col justify-between">
                            <div>
                                <div className="flex items-start justify-between">
                                    <Icon className="w-8 h-8 text-abz-primary mb-3" />
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => setEditingTemplate(template)} className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-abz-ink-900 hover:text-abz-primary">
                                            <PencilIcon className="w-4 h-4" />
                                        </button>
                                         <button onClick={() => handleDelete(template.id)} className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-abz-ink-900 hover:text-abz-danger">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <h3 className="font-bold text-lg">{template.title}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex-grow">{template.description}</p>
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-gray-800">
                                 <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase">
                                    {template.sections.length} Sections
                                </p>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    );
};

export default TemplateStudioView;
