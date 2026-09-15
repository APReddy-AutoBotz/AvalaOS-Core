import React, { useEffect, useRef, useState } from 'react';
import type { EnterpriseSessionState, TenantContextProjection } from '../../types';
import {
  canManageSyntheticUsers,
  syntheticAdminErrorCopy,
  syntheticAdminRequest,
  type SyntheticAdminTransport,
} from '../../services/syntheticAdminClient';
import {
  SYNTHETIC_ADMIN_ROLE_PRESETS,
  SYNTHETIC_ADMIN_PASSWORD_MAX_LENGTH,
  type SyntheticAdminRolePreset,
  type SyntheticAdminRosterItem,
  type SyntheticAdminResult,
} from '../../services/syntheticAdminContract';

type ReservationAttempt = {
  label: string;
  rolePreset: SyntheticAdminRolePreset;
  binding: { requestId: string; idempotencyKey: string };
};

const newBinding = (operation: string, _resourceId: string) => ({
  requestId: crypto.randomUUID(),
  idempotencyKey: `synthetic-admin:${operation}:${crypto.randomUUID()}`,
});
const uncertain = (error: unknown) => {
  const code = typeof error === 'object' && error && 'errorCode' in error ? String(error.errorCode) : '';
  return !['INVALID_REQUEST','PERMISSION_DENIED','AUTHORIZATION_STALE','FEATURE_DISABLED','QUOTA_EXCEEDED','NOT_FOUND','VERSION_CONFLICT'].includes(code);
};
const strongPassword = (value: string) => value.length >= 12 && value.length <= SYNTHETIC_ADMIN_PASSWORD_MAX_LENGTH
  && /^[\x21-\x7e]+$/.test(value) && /[A-Z]/.test(value) && /[a-z]/.test(value)
  && /[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value);

export default function SyntheticUserManagement({ tenantContext, sessionState, transport }: {
  tenantContext: TenantContextProjection | null;
  sessionState: EnterpriseSessionState;
  transport?: SyntheticAdminTransport;
}) {
  const scope = `${tenantContext?.organizationId ?? ''}:${tenantContext?.workspaceId ?? ''}:${tenantContext?.userId ?? ''}:${tenantContext?.authorizationVersion ?? ''}:${(tenantContext?.capabilities ?? []).slice().sort().join(',')}:${sessionState}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const sequence = useRef(0);
  const busyStatus = useRef<HTMLParagraphElement>(null);
  const errorAlert = useRef<HTMLParagraphElement>(null);
  const enabled = canManageSyntheticUsers(tenantContext, sessionState);
  const [label, setLabel] = useState('');
  const [rolePreset, setRolePreset] = useState<SyntheticAdminRolePreset>('author');
  const [password, setPassword] = useState('');
  const [reservation, setReservation] = useState<SyntheticAdminResult | null>(null);
  const [reserveAttempt, setReserveAttempt] = useState<ReservationAttempt | null>(null);
  const [executeUncertain, setExecuteUncertain] = useState(false);
  const [unknownRosterOperation, setUnknownRosterOperation] = useState<{reservationId:string;operation:'assign_role'|'revoke'} | null>(null);
  const [roster, setRoster] = useState<SyntheticAdminRosterItem[]>([]);
  const [roleEdits, setRoleEdits] = useState<Record<string,SyntheticAdminRolePreset>>({});
  const [revokePendingId, setRevokePendingId] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [displayScope, setDisplayScope] = useState(scope);

  useEffect(() => {
    if (busy) busyStatus.current?.focus();
    else if (error) errorAlert.current?.focus();
  }, [busy, error]);

  const reload = async (cursor?: string) => {
    if (!enabled || !tenantContext) return;
    const atScope = scope;
    const atSequence = ++sequence.current;
    try {
      const result = await syntheticAdminRequest(tenantContext, 'list', { limit: 20, ...(cursor ? { cursor } : {}) }, transport);
      if (scopeRef.current !== atScope || sequence.current !== atSequence) return;
      setRoster(previous => cursor ? [...previous, ...(result.roster ?? [])] : result.roster ?? []);
      setRoleEdits({}); setRevokePendingId('');
      setNextCursor(result.nextCursor ?? null);
    } catch (cause) {
      if (scopeRef.current === atScope && sequence.current === atSequence) setError(syntheticAdminErrorCopy(cause));
    }
  };

  useEffect(() => {
    ++sequence.current;
    setLabel(''); setRolePreset('author'); setPassword(''); setReservation(null);
    setReserveAttempt(null); setExecuteUncertain(false); setUnknownRosterOperation(null); setRoster([]); setRoleEdits({}); setRevokePendingId(''); setNextCursor(null);
    setBusy(false); setMessage(''); setError('');
    setDisplayScope(scope);
    if (enabled) void reload();
    return () => { ++sequence.current; };
  }, [scope]);

  const reserve = async (attempt: ReservationAttempt) => {
    if (!enabled || !tenantContext || busy || executeUncertain || unknownRosterOperation) return;
    const atScope = scope;
    setBusy(true); setError(''); setMessage(''); setReserveAttempt(attempt);
    try {
      const result = await syntheticAdminRequest(tenantContext, 'reserve',
        { label: attempt.label, rolePreset: attempt.rolePreset }, transport, attempt.binding);
      if (scopeRef.current !== atScope) return;
      setReservation(result); setReserveAttempt(null);
      setMessage('Account reserved. Enter a temporary password once to activate it.');
      await reload();
    } catch (cause) {
      if (scopeRef.current !== atScope) return;
      setError(syntheticAdminErrorCopy(cause));
      if (!uncertain(cause)) setReserveAttempt(null);
    } finally { if (scopeRef.current === atScope) setBusy(false); }
  };

  const execute = async () => {
    if (!enabled || !tenantContext || !reservation?.reservationId || busy || executeUncertain || !strongPassword(password)) return;
    const atScope = scope;
    const reservationId = reservation.reservationId;
    const submittedPassword = password;
    setPassword(''); setBusy(true); setError(''); setMessage('');
    try {
      const result = await syntheticAdminRequest(tenantContext, 'execute',
        { reservationId, password: submittedPassword }, transport, newBinding('execute', reservationId));
      if (scopeRef.current !== atScope) return;
      setReservation(result);
      if (result.status === 'active') {
        setMessage('The synthetic account is active. The temporary password is no longer held in this form.');
        await reload();
      } else {
        setExecuteUncertain(true);
        setMessage('The account is not confirmed active. Reconcile its server state before another action.');
      }
    } catch (cause) {
      if (scopeRef.current !== atScope) return;
      setError(syntheticAdminErrorCopy(cause));
      setExecuteUncertain(uncertain(cause));
    } finally {
      if (scopeRef.current === atScope) { setPassword(''); setBusy(false); }
    }
  };

  const reconcile = async (requestedId?: string) => {
    const reservationId = requestedId ?? reservation?.reservationId;
    if (!enabled || !tenantContext || !reservationId || busy) return;
    const atScope = scope;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await syntheticAdminRequest(tenantContext, 'reconcile',
        { reservationId }, transport, newBinding('reconcile', reservationId));
      if (scopeRef.current !== atScope) return;
      if (!requestedId && reservation?.reservationId === reservationId) {
        setReservation(result);
        setExecuteUncertain(result.status !== 'active');
      }
      if (unknownRosterOperation?.reservationId === reservationId) {
        const resolved = unknownRosterOperation.operation === 'revoke' ? result.status === 'revoked' : result.status === 'active';
        if (resolved) setUnknownRosterOperation(null);
      }
      setMessage(result.status === 'revoked' ? 'The account is confirmed revoked in server state.'
        : result.status === 'active' ? 'The account is confirmed in server state.'
        : result.status === 'ban_required' || result.status === 'ban_uncertain' ? 'The Auth ban remains unconfirmed. Retry reconciliation for this same account later.'
        : 'The account still needs reconciliation. No new account was provisioned.');
      await reload();
    } catch (cause) {
      if (scopeRef.current === atScope) setError(syntheticAdminErrorCopy(cause));
    } finally { if (scopeRef.current === atScope) setBusy(false); }
  };

  const changeRoster = async (item: SyntheticAdminRosterItem, operation: 'assign_role' | 'revoke', preset?: SyntheticAdminRolePreset) => {
    if (!enabled || !tenantContext || busy || reserveAttempt || executeUncertain || unknownRosterOperation) return;
    const atScope = scope;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await syntheticAdminRequest(tenantContext, operation,
        { reservationId: item.reservationId, expectedVersion: item.version, ...(preset ? { rolePreset: preset } : {}) },
        transport, newBinding(operation, item.reservationId));
      if (scopeRef.current !== atScope) return;
      if (operation === 'revoke' && result.status !== 'revoked' || operation === 'assign_role' && result.status !== 'active') {
        setUnknownRosterOperation({reservationId:item.reservationId,operation});
        setMessage('The account change is not confirmed. Reconcile it before another action.');
      } else setMessage(operation === 'revoke' ? 'Account access revoked in server state.' : 'Account role updated in server state.');
      await reload();
    } catch (cause) {
      if (scopeRef.current === atScope) {
        setError(syntheticAdminErrorCopy(cause));
        if (uncertain(cause)) setUnknownRosterOperation({reservationId:item.reservationId,operation});
      }
    } finally { if (scopeRef.current === atScope) setBusy(false); }
  };

  if (displayScope !== scope) return <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800" data-testid="synthetic-user-management">
    <h2 className="text-lg font-semibold">Synthetic test accounts</h2>
    <p role="status" className="mt-2 text-sm">Checking the selected workspace and account authority.</p>
  </section>;

  if (!enabled) return <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800" data-testid="synthetic-user-management">
    <h2 className="text-lg font-semibold">Synthetic test accounts</h2>
    <p role="status" className="mt-2 text-sm">Account management is unavailable for your current workspace role or environment.</p>
  </section>;

  return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-700 dark:bg-slate-800" data-testid="synthetic-user-management" aria-labelledby="synthetic-admin-title" aria-busy={busy}>
    <h2 id="synthetic-admin-title" className="text-lg font-semibold">Synthetic test accounts</h2>
    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Add exploratory accounts to this synthetic workspace with an author, reviewer, approver, or viewer role. These are separate from the fixed acceptance-test accounts.</p>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Choose and save the temporary password privately before activating the account. The form clears it after one submission.</p>
    {message && <p role="status" className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-950">{message}</p>}
    {error && <p ref={errorAlert} role="alert" tabIndex={-1} className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {busy && <p ref={busyStatus} role="status" tabIndex={0} className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-950 focus:outline-none focus:ring-2 focus:ring-indigo-600">Verifying account operation. Wait for the server result.</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold">Account label<input className="mt-1 w-full rounded-lg border p-2" maxLength={40} value={label} disabled={busy || !!reserveAttempt || executeUncertain || !!reservation} onChange={event => setLabel(event.target.value)} /></label>
      <label className="text-sm font-semibold">Workspace role<select className="mt-1 w-full rounded-lg border p-2" value={rolePreset} disabled={busy || !!reserveAttempt || executeUncertain || !!reservation} onChange={event => setRolePreset(event.target.value as SyntheticAdminRolePreset)}>{SYNTHETIC_ADMIN_ROLE_PRESETS.map(role => <option key={role} value={role}>{role}</option>)}</select></label>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className="rounded-lg bg-[#002C4B] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={busy || !!reserveAttempt || executeUncertain || !!reservation || !!unknownRosterOperation || !label.trim()} onClick={() => void reserve({label:label.trim(),rolePreset,binding:newBinding('reserve',label.trim())})}>Reserve account</button>
      {reserveAttempt && <button type="button" className="rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50" disabled={busy} onClick={() => void reserve(reserveAttempt)}>Recover original reservation</button>}
    </div>
    {reserveAttempt && <p role="status" className="mt-2 text-sm">The reservation result is unknown. Recovery repeats the same saved operation key and account details.</p>}
    {reservation?.reservationId && <div className="mt-4 rounded-xl border p-3">
      <p className="text-sm font-bold">Account operation: {reservation.status} · version {reservation.version}</p>
      {reservation.loginId && <p className="mt-1 break-all text-sm">Login ID: {reservation.loginId}</p>}
      {reservation.status === 'reserved' && !executeUncertain && <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-semibold">Temporary password<input type="password" autoComplete="new-password" minLength={12} maxLength={SYNTHETIC_ADMIN_PASSWORD_MAX_LENGTH} className="mt-1 w-full rounded-lg border p-2" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
        <button type="button" className="rounded-lg bg-[#002C4B] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={busy || !strongPassword(password)} onClick={() => void execute()}>Activate reserved account once</button>
      </div>}
      {reservation.status === 'reserved' && <p className="mt-2 text-xs">Password requires 12–72 ASCII characters, with upper and lower case letters, a digit, and a symbol; spaces are not accepted.</p>}
      {executeUncertain && <p role="status" className="mt-2 text-sm">Activation is locked until the original account operation is reconciled.</p>}
      {(executeUncertain || reservation.status === 'reconciliation_required' || reservation.status === 'execution_claimed') && <button type="button" className="mt-3 rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50" disabled={busy} onClick={() => void reconcile()}>Reconcile account state</button>}
      {reservation.status === 'active' && <button type="button" className="mt-3 rounded-lg border px-4 py-2 text-sm font-bold disabled:opacity-50" disabled={busy || !!unknownRosterOperation} onClick={() => {setReservation(null);setPassword('');setLabel('');setRolePreset('author');}}>Add another account</button>}
    </div>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-bold">Server-confirmed roster</h3><button type="button" className="rounded-lg border px-3 py-1.5 text-sm font-bold disabled:opacity-50" disabled={busy} onClick={() => void reload()}>Reload roster</button></div>
    {unknownRosterOperation && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><p role="status">An account change has an unknown outcome. Other changes are locked until this operation is reconciled.</p><button type="button" className="mt-2 rounded-lg border px-2 py-1 font-bold disabled:opacity-50" disabled={busy} onClick={() => void reconcile(unknownRosterOperation.reservationId)}>Reconcile roster operation</button></div>}
    <ul className="mt-3 grid gap-3" aria-label="Synthetic account roster">{roster.map(item => <li key={item.reservationId} className="rounded-xl border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{item.label}</p><p className="break-all">Login ID: {item.loginId}</p><p>Role: {item.rolePreset} · State: {item.state} · v{item.version}</p></div>{item.state === 'active' && <div className="flex flex-wrap items-center gap-2"><label className="text-xs font-semibold">New role<select className="ml-2 rounded-lg border p-1" value={roleEdits[item.reservationId] ?? item.rolePreset} disabled={busy || !!reserveAttempt || executeUncertain || !!unknownRosterOperation} onChange={event => setRoleEdits(previous => ({...previous,[item.reservationId]:event.target.value as SyntheticAdminRolePreset}))}>{SYNTHETIC_ADMIN_ROLE_PRESETS.map(role => <option key={role} value={role}>{role}</option>)}</select></label><button type="button" className="rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-50" disabled={busy || !!reserveAttempt || executeUncertain || !!unknownRosterOperation || !roleEdits[item.reservationId] || roleEdits[item.reservationId] === item.rolePreset} onClick={() => void changeRoster(item,'assign_role',roleEdits[item.reservationId])}>Apply role</button>{revokePendingId === item.reservationId ? <><button type="button" className="rounded-lg border px-2 py-1 text-xs font-bold text-red-700 disabled:opacity-50" disabled={busy || !!reserveAttempt || executeUncertain || !!unknownRosterOperation} onClick={() => void changeRoster(item,'revoke')}>Confirm revoke</button><button type="button" className="rounded-lg border px-2 py-1 text-xs font-bold disabled:opacity-50" disabled={busy} onClick={() => setRevokePendingId('')}>Cancel</button></> : <button type="button" className="rounded-lg border px-2 py-1 text-xs font-bold text-red-700 disabled:opacity-50" disabled={busy || !!reserveAttempt || executeUncertain || !!unknownRosterOperation} onClick={() => setRevokePendingId(item.reservationId)}>Revoke access</button>}</div>}{(item.state === 'ban_required' || item.state === 'ban_uncertain') && <button type="button" className="rounded-lg border border-amber-400 px-2 py-1 text-xs font-bold disabled:opacity-50" disabled={busy} onClick={() => void reconcile(item.reservationId)}>Reconcile Auth ban</button>}</div>
    </li>)}</ul>
    {!roster.length && <p className="mt-3 text-sm">No confirmed exploratory accounts in this workspace.</p>}
    {nextCursor && <button type="button" className="mt-3 rounded-lg border px-3 py-1.5 text-sm font-bold disabled:opacity-50" disabled={busy} onClick={() => void reload(nextCursor)}>Load more accounts</button>}
  </section>;
}
