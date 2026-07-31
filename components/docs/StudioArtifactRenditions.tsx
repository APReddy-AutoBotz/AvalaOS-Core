import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { TenantContextProjection } from '../../types';
import type { StudioArtifactProjectionDto } from '../../services/studioArtifacts/contracts';
import {
  downloadStudioPrivateArtifact,
  executeStudioPrivateArtifactCommand,
  readStudioPrivateArtifact,
  StudioPrivateArtifactBoundaryError,
  type StudioPrivateArtifactTransport,
} from '../../services/studioArtifacts/privateArtifactClient';
import {
  STUDIO_PRIVATE_ARTIFACT_FORMATS,
  type StudioPrivateArtifactCommandType,
  type StudioPrivateArtifactFormat,
  type StudioPrivateArtifactProjectionDto,
  type StudioRenditionProjectionDto,
} from '../../services/studioArtifacts/privateArtifactContracts';

interface Props {
  context: TenantContextProjection;
  artifact: StudioArtifactProjectionDto;
  capabilities?: readonly string[];
  online?: boolean;
  transport?: StudioPrivateArtifactTransport;
}

type PanelState =
  | 'loading'
  | 'ready'
  | 'offline'
  | 'stale'
  | 'version_conflict'
  | 'read_only'
  | 'download_unavailable'
  | 'command_failed'
  | 'committed_reload_failed';

const capability: Record<StudioPrivateArtifactCommandType, string> = {
  'studio.rendition.generate': 'studio.artifacts.rendition.generate',
  'studio.retention.policy.publish': 'studio.artifacts.retention.manage',
  'studio.rendition.retention.extend': 'studio.artifacts.retention.manage',
  'studio.legal_hold.place': 'studio.artifacts.legal_hold.manage',
  'studio.legal_hold.release': 'studio.artifacts.legal_hold.manage',
  'studio.rendition.deletion.request': 'studio.artifacts.delete.request',
  'studio.rendition.deletion.resolve': 'studio.artifacts.delete.approve',
};

const formatLabel: Record<StudioPrivateArtifactFormat, string> = {
  markdown: 'Markdown',
  pdf: 'PDF',
  docx: 'DOCX',
};
const stateLabel: Record<StudioRenditionProjectionDto['state'], string> = {
  requested: 'Generation requested',
  rendering: 'Rendering',
  uploading: 'Uploading',
  reconciliation_required: 'Generation reconciliation required',
  reconciling: 'Reconciling generation',
  available: 'Available',
  failed: 'Generation failed',
  deletion_requested: 'Deletion requested — approval pending',
  deleting: 'Deleting',
  deletion_reconciliation_required: 'Deletion reconciliation required',
  deletion_reconciling: 'Reconciling deletion',
  deleted: 'Deleted',
  deletion_failed: 'Deletion failed',
};
const mutationBlockingStates = new Set([
  'loading',
  'offline',
  'stale',
  'version_conflict',
  'read_only',
  'committed_reload_failed',
]);
const canonicalRenditionMutationStates = new Set<StudioRenditionProjectionDto['state']>([
  'available',
  'deletion_requested',
  'deletion_failed',
]);

const stateForError = (error: unknown): { state: PanelState; message: string } => {
  if (!navigator.onLine) {
    return { state: 'offline', message: 'Offline. No private-artifact command was submitted.' };
  }
  if (error instanceof StudioPrivateArtifactBoundaryError) {
    if (error.code === 'AUTHORITY_STALE' || error.code === 'PERMISSION_DENIED') {
      return {
        state: 'stale',
        message: 'Authorization is stale or revoked. Private-artifact mutations are blocked.',
      };
    }
    if (error.code === 'VERSION_CONFLICT') {
      return {
        state: 'version_conflict',
        message: 'Version conflict. Reload the current committed rendition state.',
      };
    }
    if (error.code === 'READ_ONLY' || error.code === 'FEATURE_DISABLED') {
      return {
        state: 'read_only',
        message: 'Read-only maintenance. Committed rendition metadata remains visible.',
      };
    }
    if (error.code === 'DOWNLOAD_UNAVAILABLE') {
      return {
        state: 'download_unavailable',
        message: 'Download unavailable. No successful download was recorded.',
      };
    }
    if (error.code === 'RETENTION_BLOCKED' || error.code === 'LEGAL_HOLD_BLOCKED') {
      return {
        state: 'command_failed',
        message: 'Deletion is blocked by committed retention or legal-hold authority.',
      };
    }
    if (error.code === 'STUDIO_DELETION_BLOCKED') {
      return {
        state: 'command_failed',
        message: 'The lifecycle change is blocked because deletion authority has already advanced.',
      };
    }
  }
  return {
    state: 'command_failed',
    message: 'Command failed before completion. No success was recorded.',
  };
};

const saveBrokeredDownload = async (
  download: Awaited<ReturnType<typeof downloadStudioPrivateArtifact>>,
) => {
  const objectUrl = URL.createObjectURL(download.bytes);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = download.filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export default function StudioArtifactRenditions({
  context,
  artifact,
  capabilities = context.capabilities,
  online = true,
  transport,
}: Props) {
  const approvedVersion = artifact.currentApprovedVersion;
  const [projection, setProjection] = useState<StudioPrivateArtifactProjectionDto | null>(null);
  const [panelState, setPanelState] = useState<PanelState>('loading');
  const [message, setMessage] = useState('Loading committed private rendition state.');
  const [reason, setReason] = useState('');
  const [retentionUntil, setRetentionUntil] = useState('');
  const offline = !online || !navigator.onLine;
  const blocked =
    offline ||
    mutationBlockingStates.has(panelState) ||
    projection?.readOnly === true;

  const byFormat = useMemo(
    () =>
      Object.fromEntries(
        (projection?.renditions ?? []).map(rendition => [rendition.format, rendition]),
      ) as Partial<Record<StudioPrivateArtifactFormat, StudioRenditionProjectionDto>>,
    [projection],
  );

  const load = useCallback(async () => {
    if (!approvedVersion) {
      setProjection(null);
      setPanelState('stale');
      setMessage('Private renditions require an approved canonical artifact version.');
      return;
    }
    if (offline) {
      setPanelState('offline');
      setMessage('Offline. Committed rendition state remains visible; mutations are blocked.');
      return;
    }
    setPanelState('loading');
    try {
      const next = await readStudioPrivateArtifact(
        context,
        artifact.id,
        approvedVersion.id,
        transport,
      );
      setProjection(next);
      setPanelState(next.readOnly ? 'read_only' : 'ready');
      setMessage(
        next.readOnly
          ? 'Read-only maintenance. Committed rendition metadata remains visible.'
          : 'Current committed private rendition state loaded.',
      );
    } catch (error) {
      const next = stateForError(error);
      setPanelState(next.state === 'command_failed' ? 'stale' : next.state);
      setMessage(
        next.state === 'command_failed'
          ? 'Private rendition authority is unavailable. Reload committed state.'
          : next.message,
      );
    }
  }, [
    approvedVersion?.id,
    artifact.id,
    context.organizationId,
    context.workspaceId,
    offline,
    transport,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!approvedVersion) return null;

  const can = (commandType: StudioPrivateArtifactCommandType) =>
    !blocked && capabilities.includes(capability[commandType]);

  const run = async (
    commandType: StudioPrivateArtifactCommandType,
    rendition: StudioRenditionProjectionDto | null,
    payload: Record<string, unknown>,
  ) => {
    if (blocked) return;
    setPanelState('loading');
    setMessage('Pending. Success appears only after the committed projection reloads.');
    try {
      const result = await executeStudioPrivateArtifactCommand(
        context,
        commandType,
        projection,
        rendition,
        payload as never,
        crypto.randomUUID(),
        transport,
      );
      try {
        const committed = await readStudioPrivateArtifact(
          context,
          artifact.id,
          approvedVersion.id,
          transport,
        );
        setProjection(committed);
        setPanelState(committed.readOnly ? 'read_only' : 'ready');
        const failed =
          result.outcome === 'rendition_failed' || result.outcome === 'deletion_failed';
        setMessage(
          result.outcome === 'committed_reconciliation_pending'
            ? `Command committed (receipt ${result.receiptId}), but the external effect is unconfirmed. Recovery is pending; committed state was reloaded.`
            : failed
            ? 'The committed operation failed. No success state was recorded.'
            : `Committed state reloaded (receipt ${result.receiptId}).`,
        );
      } catch {
        setPanelState('committed_reload_failed');
        setMessage(
          `Command committed (receipt ${result.receiptId}), but reload failed. Further mutations are blocked.`,
        );
      }
    } catch (error) {
      const next = stateForError(error);
      setPanelState(next.state);
      setMessage(next.message);
    }
  };

  const download = async (rendition: StudioRenditionProjectionDto) => {
    if (blocked || rendition.state !== 'available') return;
    setMessage('Authorizing brokered download. Success requires exact-byte retrieval.');
    try {
      const result = await downloadStudioPrivateArtifact(
        context,
        rendition.id,
        crypto.randomUUID(),
        transport,
      );
      await saveBrokeredDownload(result);
      setPanelState('ready');
      setMessage('Brokered download completed.');
    } catch (error) {
      const next = stateForError(error);
      setPanelState(next.state);
      setMessage(next.message);
    }
  };

  return (
    <section
      data-testid="studio-artifact-renditions"
      aria-labelledby="studio-renditions-title"
      className="mt-5 min-w-0 rounded-2xl border border-slate-300 bg-white p-4 text-slate-950"
    >
      <h3 id="studio-renditions-title" className="text-xl font-black">
        Private governed renditions
      </h3>
      <p className="mt-1 text-sm">
        Downloads apply only to this approved canonical Studio version. Legacy document cards remain non-canonical.
      </p>
      {offline && (
        <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3">
          Offline. Committed rendition state remains visible; mutations are blocked.
        </p>
      )}
      {(projection?.readOnly || panelState === 'read_only') && (
        <p role="status" className="mt-3 rounded-xl bg-blue-50 p-3">
          Read-only maintenance. Committed private-artifact metadata remains visible.
        </p>
      )}
      <p role="status" aria-live="polite" className="mt-3 break-words font-semibold">
        {message}
      </p>
      {panelState === 'committed_reload_failed' && (
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-xl bg-[#002C4B] px-3 py-2 font-bold text-white"
        >
          Reload explicitly committed rendition state
        </button>
      )}

      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-3">
        {STUDIO_PRIVATE_ARTIFACT_FORMATS.map(format => {
          const rendition = byFormat[format];
          const generating =
            rendition && ['requested', 'rendering', 'uploading'].includes(rendition.state);
          const downloadable = rendition?.state === 'available';
          const pendingDeletion =
            rendition?.deletion?.state === 'pending' ||
            rendition?.state === 'deletion_requested';
          const canonicalMutationAllowed = Boolean(
            rendition && canonicalRenditionMutationStates.has(rendition.state),
          );
          return (
            <article
              key={format}
              data-testid={`rendition-${format}`}
              className="min-w-0 rounded-2xl border border-slate-200 p-3"
            >
              <h4 className="text-lg font-black">{formatLabel[format]}</h4>
              <p className="font-semibold">
                {!rendition ? 'Not generated' : stateLabel[rendition.state]}
              </p>
              {rendition && (
                <dl className="mt-2 grid min-w-0 grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-sm">
                  <dt className="font-bold">Renderer</dt>
                  <dd className="min-w-0 break-all">{rendition.rendererVersion}</dd>
                  <dt className="font-bold">Hash</dt>
                  <dd className="min-w-0 break-all">
                    {rendition.sha256 ?? 'Available after verified upload'}
                  </dd>
                  <dt className="font-bold">Bytes</dt>
                  <dd>{rendition.byteLength?.toLocaleString() ?? 'Pending verification'}</dd>
                  <dt className="font-bold">Retention</dt>
                  <dd className="min-w-0 break-words">
                    {rendition.retentionMode === null
                      ? 'Pending availability snapshot'
                      : rendition.retentionMode === 'indefinite'
                      ? 'Indefinite retention'
                      : `Active through ${new Date(rendition.retentionUntil!).toLocaleDateString()}`}
                  </dd>
                  <dt className="font-bold">Legal hold</dt>
                  <dd>{rendition.legalHoldActive ? 'Active' : 'Not active'}</dd>
                </dl>
              )}
              {rendition && rendition.activeHolds.length > 0 && (
                <ul
                  aria-label={`${formatLabel[format]} active legal holds`}
                  className="mt-2 space-y-2"
                >
                  {rendition.activeHolds.map(hold => (
                    <li key={hold.holdId} className="rounded-lg bg-amber-50 p-2 text-sm">
                      <span>
                        Hold placed {new Date(hold.placedAt).toLocaleDateString()}
                      </span>
                      <button
                        type="button"
                        disabled={!can('studio.legal_hold.release') || !reason}
                        onClick={() =>
                          void run('studio.legal_hold.release', rendition, {
                            renditionId: rendition.id,
                            holdId: hold.holdId,
                            reason,
                          })
                        }
                        className="btn-ghost ml-2 disabled:opacity-50"
                        aria-label={`Release legal hold placed ${new Date(hold.placedAt).toLocaleDateString()}`}
                      >
                        Release hold
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {rendition?.failureCode && (
                <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm">
                  Failure: {rendition.failureCode}. Retry only after reviewing committed state.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    !can('studio.rendition.generate') ||
                    Boolean(rendition && rendition.state !== 'failed') ||
                    Boolean(generating)
                  }
                  onClick={() =>
                    void run('studio.rendition.generate', null, {
                      artifactId: artifact.id,
                      artifactVersionId: approvedVersion.id,
                      format,
                    })
                  }
                  className="btn-ghost disabled:opacity-50"
                >
                  {rendition?.state === 'failed' ? `Retry ${formatLabel[format]}` : `Generate ${formatLabel[format]}`}
                </button>
                {rendition?.state === 'deleted' && (
                  <p className="w-full rounded-lg bg-slate-100 p-2 text-sm">
                    This rendition is an immutable deleted tombstone. Generate from a new approved artifact version.
                  </p>
                )}
                <button
                  type="button"
                  disabled={
                    !capabilities.includes('studio.artifacts.download') ||
                    blocked ||
                    !downloadable
                  }
                  onClick={() => rendition && void download(rendition)}
                  className="btn-ghost disabled:opacity-50"
                >
                  {downloadable ? `Download ${formatLabel[format]}` : 'Download unavailable'}
                </button>
                {rendition && canonicalMutationAllowed && (
                  <button
                    type="button"
                    disabled={!can('studio.legal_hold.place') || !reason}
                    onClick={() =>
                      void run('studio.legal_hold.place', rendition, {
                        renditionId: rendition.id,
                        reason,
                      })
                    }
                    className="btn-ghost disabled:opacity-50"
                  >
                    {rendition.legalHoldActive ? 'Place another legal hold' : 'Place legal hold'}
                  </button>
                )}
                {rendition &&
                  ['available', 'deletion_failed'].includes(rendition.state) &&
                  !pendingDeletion && (
                  <button
                    type="button"
                    disabled={
                      !can('studio.rendition.deletion.request') ||
                      !reason ||
                      rendition.legalHoldActive
                    }
                    onClick={() =>
                      void run('studio.rendition.deletion.request', rendition, {
                        renditionId: rendition.id,
                        reason,
                      })
                    }
                    className="btn-ghost disabled:opacity-50"
                  >
                    {rendition.state === 'deletion_failed'
                      ? 'Request deletion again'
                      : 'Request deletion'}
                  </button>
                )}
                {rendition && pendingDeletion && rendition.deletion && (
                  <>
                    <button
                      type="button"
                      disabled={
                        !can('studio.rendition.deletion.resolve') ||
                        !reason ||
                        rendition.deletion.requesterIsCurrentActor
                      }
                      onClick={() =>
                        void run('studio.rendition.deletion.resolve', rendition, {
                          renditionId: rendition.id,
                          deletionRequestId: rendition.deletion!.requestId,
                          outcome: 'approve',
                          reason,
                        })
                      }
                      className="btn-ghost disabled:opacity-50"
                    >
                      Approve deletion
                    </button>
                    <button
                      type="button"
                      disabled={
                        !can('studio.rendition.deletion.resolve') ||
                        !reason ||
                        rendition.deletion.requesterIsCurrentActor
                      }
                      onClick={() =>
                        void run('studio.rendition.deletion.resolve', rendition, {
                          renditionId: rendition.id,
                          deletionRequestId: rendition.deletion!.requestId,
                          outcome: 'reject',
                          reason,
                        })
                      }
                      className="btn-ghost disabled:opacity-50"
                    >
                      Reject deletion
                    </button>
                  </>
                )}
              </div>
              {rendition && canonicalMutationAllowed && (
                <div className="mt-3">
                  <label className="text-sm font-bold">
                    Extend retention until
                    <input
                      type="date"
                      value={retentionUntil}
                      onChange={event => setRetentionUntil(event.target.value)}
                      className="mt-1 w-full rounded-lg border p-2"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!can('studio.rendition.retention.extend') || !retentionUntil || !reason}
                    onClick={() =>
                      void run('studio.rendition.retention.extend', rendition, {
                        renditionId: rendition.id,
                        retentionUntil: new Date(`${retentionUntil}T00:00:00.000Z`).toISOString(),
                        reason,
                      })
                    }
                    className="btn-ghost mt-2 disabled:opacity-50"
                  >
                    Extend retention
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <label className="mt-4 block font-bold">
        Governed reason
        <textarea
          value={reason}
          onChange={event => setReason(event.target.value)}
          maxLength={4000}
          rows={3}
          className="mt-1 w-full rounded-xl border p-2"
        />
      </label>
      <p className="mt-3 text-xs">
        Storage coordinates, provider details, private object paths, and service identity are
        never exposed by this view.
      </p>
    </section>
  );
}
