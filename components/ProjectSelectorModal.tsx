import React from 'react';
import { Project } from '../types';
import Modal from './Modal';
import { CubeIcon } from './icons';

interface ProjectSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    projects: Project[];
    onProjectSelect: (project: Project) => void;
}

const ProjectSelectorModal: React.FC<ProjectSelectorModalProps> = ({ isOpen, onClose, projects, onProjectSelect }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Select a Project">
            <div className="space-y-2">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    The AI Assistant generates documents within the context of a specific project. Please choose a project to continue.
                </p>
                <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
                    {projects.map(project => (
                        <button
                            key={project.id}
                            onClick={() => onProjectSelect(project)}
                            className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors hover:bg-slate-100 dark:hover:bg-abz-ink focus:outline-none focus:ring-2 focus:ring-abz-primary"
                        >
                            <CubeIcon className="w-6 h-6 text-slate-500 flex-shrink-0" />
                            <div>
                                <p className="font-semibold">{project.name}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{project.description}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </Modal>
    );
};

export default ProjectSelectorModal;
