import React, { useEffect, useState } from 'react';
import type { Task } from '../../types';
import type { StudioDeliveryScope } from '../../services/productAcceptanceBridge/client';
import { loadCompleteStudioDeliveryOutcomeProjection } from '../../services/productAcceptanceBridge/outcomePaging';
import type { DeliveryOutcome } from '../../services/productAcceptanceBridge/contracts';
import DeliveryOutcomeEditor from './DeliveryOutcomeEditor';

/** Load the current outcome before offering a version-bound human edit. */
export default function DeliveryTaskOutcome({ scope, task, readOnly }: {
  scope: StudioDeliveryScope; task: Task; readOnly: boolean;
}) {
  const identity = `${scope.actorId}:${scope.organizationId}:${scope.workspaceId}:${scope.authorizationVersion}:${task.projectId}:${task.id}:${task.version}`;
  const [result, setResult] = useState<{ identity: string; outcome: DeliveryOutcome | null } | null>(null);
  const [errorIdentity, setErrorIdentity] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    setResult(null); setErrorIdentity(null);
    const load = async () => {
      const projection = await loadCompleteStudioDeliveryOutcomeProjection(scope, task.projectId);
      if (current) setResult({ identity, outcome: projection.items.find(item => item.taskId === task.id) ?? null });
    };
    void load().catch(() => { if (current) setErrorIdentity(identity); });
    return () => { current = false; };
  }, [identity, reload]);
  if (errorIdentity === identity) return <div role="alert" className="mt-4 rounded-xl border p-4">
    <p>The current recorded outcome could not be loaded. Outcome editing is unavailable.</p>
    <button type="button" className="btn-ghost mt-2" onClick={() => setReload(value => value + 1)}>Reload recorded outcome</button>
  </div>;
  if (result?.identity !== identity) return <p role="status" className="mt-4">Loading the current recorded outcome.</p>;
  return <div className="mt-5"><DeliveryOutcomeEditor
    key={`${identity}:${result.outcome?.version ?? 'new'}`}
    scope={scope}
    task={{ taskId: task.id, taskVersion: task.version!, title: task.title, projectId: task.projectId }}
    currentOutcome={result.outcome}
    disabled={readOnly}
    onRecorded={value => setResult({ identity, outcome: value.resource })}
  /></div>;
}
