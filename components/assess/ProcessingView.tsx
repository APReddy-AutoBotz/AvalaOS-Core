import React, { useState, useEffect } from 'react';
import { CheckCircleIcon } from '../shared/icons';

const steps = [
  "Ingesting & Transcribing",
  "Segmenting & Analyzing",
  "Extracting Key Elements",
  "Drafting Documents",
  "Building Diagrams",
  "Polishing & Rendering"
];

const ProcessingView: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep(prev => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-2xl mx-auto text-center py-16">
      <div className="relative w-20 h-20 mx-auto">
        <div className="absolute inset-0 border-4 border-abz-indigo-500/20 rounded-full"></div>
        <div className="absolute inset-0 border-t-4 border-abz-indigo-500 rounded-full animate-spin"></div>
      </div>
      <h2 className="mt-8 text-2xl font-bold text-text-light dark:text-text-dark">Avala Assess at Work...</h2>
      <p className="mt-2 text-slate-500 dark:text-slate-400">Please wait while we orchestrate your project documentation.</p>

      <div className="mt-12 text-left space-y-4">
        {steps.map((step, index) => (
          <div key={step} className={`flex items-center gap-4 transition-opacity duration-500 ${index <= currentStep ? 'opacity-100' : 'opacity-40'}`}>
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${index < currentStep ? 'bg-abz-emerald-500' : 'bg-abz-indigo-500/80'} text-white`}>
              {index < currentStep ? (
                <CheckCircleIcon className="w-5 h-5" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-white/50 overflow-hidden relative">
                  {index === currentStep && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/80 to-transparent animate-shimmer -translate-x-full"></div>}
                </div>
              )}
            </div>
            <span className={`font-medium ${index <= currentStep ? 'text-text-light dark:text-text-dark' : 'text-slate-500 dark:text-slate-400'}`}>
              {step}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProcessingView;
