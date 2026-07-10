import React, { useEffect, useState } from 'react';

// Make mermaid available globally for the script to use
declare global {
  interface Window {
    mermaid: any;
  }
}

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
    // Guard against mermaid not being available on the window object
    if (!window.mermaid) {
        console.warn("Mermaid script not loaded yet.");
        return;
    }

    // A function to render the diagram
    const renderDiagram = async () => {
      try {
        // Re-initialize on every render to pick up theme changes.
        window.mermaid.initialize({
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
        const renderId = `mermaid-svg-${id}-${Math.random().toString(36).slice(2)}`;
        
        const { svg: renderedSvg } = await window.mermaid.render(renderId, code);
        setSvg(renderedSvg);
        setError(null);
      } catch (e: any) {
        console.error(`Mermaid rendering error for ID ${id}:`, e);
        setError("Could not render diagram. Please check syntax.");
        setSvg('');
      }
    };

    renderDiagram();
    
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
