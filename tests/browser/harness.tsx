import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import TaskDetailModal from '../../components/delivery/TaskDetailModal';
import Modal from '../../components/shared/Modal';
import { MOCK_EPICS, MOCK_PROJECTS, MOCK_TASKS, MOCK_USERS } from '../../data/mockData';
import { persistBeforeCommit } from '../../services/persistenceTransition';
import { escapePlainText, sanitizeMarkdownHtml, sanitizeMermaidSvg } from '../../services/safeMarkdown';
import { buildDocumentExportHtml, markSanitizedDocumentBodyHtml } from '../../services/documentHtmlExport';
import { EnterpriseSessionStatePanel } from '../../components/auth/EnterpriseSessionStatePanel';

const markdownAttack = '<p>safe</p><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><script>alert(1)</script>';
const svgAttack = '<svg xmlns="http://www.w3.org/2000/svg"><text>safe diagram</text><script>alert(1)</script><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject></svg>';

const Harness = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [persistence, setPersistence] = useState('not-run');
  const [committed, setCommitted] = useState(false);
  const rejectPersistence = async () => {
    setPersistence('running');
    try {
      await persistBeforeCommit(
        async () => { throw new Error('Document persistence authority is unavailable.'); },
        () => setCommitted(true),
      );
    } catch (error) {
      setPersistence(error instanceof Error ? error.message : 'Persistence failed.');
    }
  };
  const exportHtml = buildDocumentExportHtml({
    documentTitle: '<img src=x onerror=parent.__exportPwned=true> Unicode ' + String.fromCodePoint(0x1f600),
    templateTitle: '<svg onload=parent.__exportPwned=true>Template</svg>',
    sanitizedBodyHtml: markSanitizedDocumentBodyHtml(sanitizeMarkdownHtml(markdownAttack)),
  });
  return <main>
    <h1>PR 1A and PR 1C browser harness</h1>
    <div className="grid min-h-[60vh] place-items-center bg-slate-50 p-6">
      <EnterpriseSessionStatePanel state="stale" message="Your authorization version changed." onRefresh={() => setPersistence('context-refresh-requested')} />
    </div>
    <section aria-labelledby="markdown-heading"><h2 id="markdown-heading">Markdown sink</h2><div data-testid="markdown-sink" dangerouslySetInnerHTML={{ __html: sanitizeMarkdownHtml(markdownAttack) }} /></section>
    <p data-testid="title-sink" dangerouslySetInnerHTML={{ __html: escapePlainText('<img src=x onerror=alert(1)>safe title') }} />
    <section aria-labelledby="svg-heading"><h2 id="svg-heading">Diagram sink</h2><div data-testid="svg-sink" dangerouslySetInnerHTML={{ __html: sanitizeMermaidSvg(svgAttack) }} /></section>
    <iframe title="Production document export" data-testid="document-export" srcDoc={exportHtml} />
    <button onClick={rejectPersistence}>Test rejected persistence</button>
    <p role="status" data-testid="persistence-status">{persistence}</p><output data-testid="committed">{String(committed)}</output>
    <button onClick={() => setModalOpen(true)}>Open controlled dialog</button>
    <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Controlled dialog"><button>First action</button><button>Last action</button></Modal>
    <button onClick={() => setTaskModalOpen(true)}>Open task detail</button>
    {taskModalOpen && (
      <TaskDetailModal
        task={MOCK_TASKS[0]}
        allTasks={MOCK_TASKS}
        project={MOCK_PROJECTS[0]}
        epic={MOCK_EPICS[0]}
        users={MOCK_USERS}
        currentUser={MOCK_USERS[0]}
        onClose={() => setTaskModalOpen(false)}
        onUpdateTask={() => undefined}
        onAddTask={() => undefined}
        onDeleteTask={() => undefined}
      />
    )}
  </main>;
};

createRoot(document.getElementById('root')!).render(<Harness />);
