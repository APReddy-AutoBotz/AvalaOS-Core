import React, { useState, useEffect } from 'react';
import Modal from '../shared/Modal';
import { PencilSquareIcon, CheckCircleIcon, XCircleIcon } from '../shared/icons';
import { ApprovalStatus } from '../../types';

interface ApprovalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (result: { status: ApprovalStatus, comments?: string }) => void;
}

type Decision = 'approve' | 'reject';

const ApprovalModal: React.FC<ApprovalModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const [decision, setDecision] = useState<Decision>('approve');
    const [comments, setComments] = useState('');

    useEffect(() => {
        if (isOpen) {
            setDecision('approve');
            setComments('');
        }
    }, [isOpen]);

    const handleSubmit = () => {
        if (decision === 'approve') {
            onSubmit({ status: 'Approved' });
        } else if (decision === 'reject' && comments.trim()) {
            onSubmit({ status: 'Rejected', comments: comments.trim() });
        }
    };
    
    const isSubmitDisabled = decision === 'reject' && !comments.trim();

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Review and Sign Document">
            <div className="space-y-6">
                <div className="text-center">
                    <PencilSquareIcon className="w-16 h-16 mx-auto text-abz-primary" />
                    <h3 className="mt-2 text-lg font-medium">Submit Your Decision</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Please approve the document or request changes with feedback. This action will be recorded.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={() => setDecision('approve')}
                        className={`p-4 rounded-lg border-2 text-center transition-all ${decision === 'approve' ? 'border-abz-emerald-500 bg-abz-emerald-500/10' : 'border-slate-300 dark:border-gray-600 hover:border-slate-400'}`}
                    >
                        <CheckCircleIcon className={`w-8 h-8 mx-auto ${decision === 'approve' ? 'text-abz-emerald-500' : 'text-slate-400'}`} />
                        <span className="mt-2 block font-semibold">Approve</span>
                    </button>
                    <button 
                        onClick={() => setDecision('reject')}
                        className={`p-4 rounded-lg border-2 text-center transition-all ${decision === 'reject' ? 'border-abz-red-500 bg-abz-red-500/10' : 'border-slate-300 dark:border-gray-600 hover:border-slate-400'}`}
                    >
                        <XCircleIcon className={`w-8 h-8 mx-auto ${decision === 'reject' ? 'text-abz-red-500' : 'text-slate-400'}`} />
                        <span className="mt-2 block font-semibold">Request Changes</span>
                    </button>
                </div>
                
                {decision === 'reject' && (
                    <div>
                        <label htmlFor="comments" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Feedback <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            id="comments"
                            name="comments"
                            rows={4}
                            value={comments}
                            onChange={(e) => setComments(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-abz-primary focus:ring-abz-primary sm:text-sm bg-white dark:bg-abz-ink"
                            placeholder="Please provide specific feedback on what needs to be changed..."
                        />
                    </div>
                )}


                <div className="flex justify-end gap-4 pt-4 border-t border-slate-200 dark:border-gray-700">
                    <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm font-semibold rounded-xl">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitDisabled}
                        className="btn-primary px-4 py-2 text-sm font-semibold rounded-xl"
                    >
                        Submit Decision
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ApprovalModal;
