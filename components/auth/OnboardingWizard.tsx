import React, { useState } from 'react';
import { KlarityLogo, SparklesIcon, BuildingOfficeIcon } from '../shared/icons';

interface OnboardingWizardProps {
  onComplete: (orgName: string) => void;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFinish = async () => {
    if (!orgName.trim()) return;
    setLoading(true);
    try {
      await onComplete(orgName);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div className="app-shell min-h-screen flex items-center justify-center p-6">
      <div className="glass-panel max-w-xl w-full rounded-[30px] overflow-hidden border border-slate-200 dark:border-gray-700">
        <div className="h-1.5 bg-slate-100 dark:bg-gray-800">
          <div 
            className="h-full transition-all duration-500" 
            style={{
              width: `${(step / 2) * 100}%`,
              background: 'var(--kp-brand-gradient-strong)'
            }}
          />
        </div>

        <div className="p-10">
          <div className="flex justify-center mb-8">
            <div className="p-1 rounded-2xl">
              <KlarityLogo className="w-16 h-16 drop-shadow-xl" />
            </div>
          </div>

          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="brand-wordmark text-3xl text-center mb-2">Welcome to KlarityPM</h2>
              <p className="text-center text-slate-500 dark:text-slate-300 mb-8 font-medium">Set up your enterprise process intelligence workspace.</p>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Organization Name</label>
                  <div className="relative">
                    <BuildingOfficeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-white/70 dark:bg-abz-ink/70 border border-slate-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-abz-primary outline-none transition-all"
                      placeholder="e.g. Acme Global Services"
                    />
                  </div>
                </div>

                <button
                  onClick={() => setStep(2)}
                  disabled={!orgName.trim()}
                  className="btn-primary w-full py-4 font-bold text-lg disabled:opacity-50"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="brand-wordmark text-3xl text-center mb-2">Almost there</h2>
              <p className="text-center text-slate-500 dark:text-slate-300 mb-8 font-medium">Your workspace is ready for guided discovery.</p>
              
              <div className="premium-surface p-6 rounded-2xl mb-8">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <SparklesIcon className="w-6 h-6 text-emerald-500" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Your workspace '{orgName}' is being provisioned.</p>
                </div>
                <ul className="space-y-3">
                  {['PostgreSQL Database Provisioned', 'RLS Security Policies Active', 'AI Discovery Engine Ready'].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-xs text-slate-500">
                      <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleFinish}
                  disabled={loading}
                  className="btn-primary flex-[2] py-4 font-bold text-lg active:scale-95 disabled:opacity-50"
                >
                  {loading ? 'Creating Workspace...' : 'Launch Workspace'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizard;
