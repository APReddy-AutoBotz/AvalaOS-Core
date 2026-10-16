import React, { useEffect, useState } from 'react';
import { sanitizeMermaidSvg } from '../../services/safeMarkdown';

type MermaidApi = (typeof import('mermaid'))['default'];

let mermaidModule: Promise<MermaidApi> | null = null;
const loadMermaid = () => {
  mermaidModule ??= import('mermaid').then(module => module.default);
  return mermaidModule;
};

interface MermaidRendererProps {
  code: string;
  id: string;
}

const MermaidRenderer: React.FC<MermaidRendererProps> = ({ code, id }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  useEffect(() => {
    // Observer to update theme state when <html> class changes
    const observer = new MutationObserver(() => {
        setCurrentTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);


  useEffect(() => {
    let cancelled = false;

    // A function to render the diagram
    const renderDiagram = async () => {
      let renderId: string | null = null;
      try {
        const mermaid = await loadMermaid();
        if (cancelled) return;
        // Re-initialize on every render to pick up theme changes.
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: currentTheme,
            flowchart: {
                useMaxWidth: true,
                htmlLabels: false,
            },
            themeVariables: {
                'primaryColor': '#002C4B',
                'primaryTextColor': '#FFFFFF',
                'lineColor': currentTheme === 'dark' ? '#374151' : '#D1D5DB',
                'textColor': currentTheme === 'dark' ? '#E2E8F0' : '#0F172A',
                'mainBkg': currentTheme === 'dark' ? '#0F172A' : '#FFFFFF',
                'errorBkgColor': '#EF4444',
                'errorTextColor': '#FFFFFF',
            }
        });
        
        // Generate a unique ID for each render to prevent mermaid from crashing on re-renders.
        renderId = `mermaid-svg-${id}-${Math.random().toString(36).slice(2)}`;
        
        const { svg: renderedSvg } = await mermaid.render(renderId, code);
        if (cancelled) return;
        setSvg(sanitizeMermaidSvg(renderedSvg));
        setError(null);
      } catch (e: any) {
        if (cancelled) return;
        console.error(`Mermaid rendering error for ID ${id}:`, e);
        setError("Could not render diagram. Please check syntax.");
        setSvg('');
      } finally {
        if (renderId) {
          document.getElementById(renderId)?.remove();
          document.getElementById(`d${renderId}`)?.remove();
          document.getElementById(`i${renderId}`)?.remove();
        }
      }
    };

    renderDiagram();

    return () => { cancelled = true; };
  }, [code, id, currentTheme]); // Rerun when code, id, or theme changes

  if (error) {
    return (
        <div className="p-4 bg-abz-danger/10 text-abz-danger rounded-lg text-sm">
            <p className="font-bold">Diagram Error</p>
            <p>{error}</p>
        </div>
    );
  }

  // Use a key to force React to re-mount the div when the svg changes
  return (
    <div key={svg} className="mermaid-container mt-2 flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />
  );
};

export default MermaidRenderer;
