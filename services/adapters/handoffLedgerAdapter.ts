import { HandoffLedgerEntry } from '../../types';
import { StorageKeys, StorageService } from '../storage';
import { isSupabaseConfigured, supabase } from '../supabaseClient';

type HandoffLedgerRow = {
  id: string;
  org_id: string;
  from_module: HandoffLedgerEntry['fromModule'];
  to_module: HandoffLedgerEntry['toModule'];
  status: HandoffLedgerEntry['status'];
  source_type: HandoffLedgerEntry['sourceType'];
  source_id: string;
  target_type?: HandoffLedgerEntry['targetType'] | null;
  target_id?: string | null;
  title: string;
  summary: string;
  created_at: string;
  created_by: string;
  evidence_refs?: string[] | null;
  metadata?: HandoffLedgerEntry['metadata'] | null;
};

const fromRow = (row: HandoffLedgerRow): HandoffLedgerEntry => ({
  id: row.id,
  orgId: row.org_id,
  fromModule: row.from_module,
  toModule: row.to_module,
  status: row.status,
  sourceType: row.source_type,
  sourceId: row.source_id,
  targetType: row.target_type || undefined,
  targetId: row.target_id || undefined,
  title: row.title,
  summary: row.summary,
  createdAt: row.created_at,
  createdBy: row.created_by,
  evidenceRefs: row.evidence_refs || [],
  metadata: row.metadata || undefined,
});

const toRow = (entry: HandoffLedgerEntry) => ({
  id: entry.id,
  org_id: entry.orgId,
  from_module: entry.fromModule,
  to_module: entry.toModule,
  status: entry.status,
  source_type: entry.sourceType,
  source_id: entry.sourceId,
  target_type: entry.targetType || null,
  target_id: entry.targetId || null,
  title: entry.title,
  summary: entry.summary,
  created_at: entry.createdAt,
  created_by: entry.createdBy,
  evidence_refs: entry.evidenceRefs,
  metadata: entry.metadata || {},
});

const loadLocalLedger = () => StorageService.load<HandoffLedgerEntry[]>(StorageKeys.HANDOFF_LEDGER, []);

export const handoffLedgerAdapter = {
  async list(orgId: string): Promise<HandoffLedgerEntry[]> {
    if (!isSupabaseConfigured()) {
      return loadLocalLedger().filter(entry => entry.orgId === orgId);
    }

    const { data, error } = await supabase
      .from('handoff_ledger_entries')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(fromRow);
  },

  async record(entry: HandoffLedgerEntry): Promise<HandoffLedgerEntry> {
    if (!isSupabaseConfigured()) {
      const allEntries = loadLocalLedger();
      const nextEntries = [entry, ...allEntries.filter(item => item.id !== entry.id)];
      StorageService.save(StorageKeys.HANDOFF_LEDGER, nextEntries);
      return entry;
    }

    const { data, error } = await supabase
      .from('handoff_ledger_entries')
      .upsert([toRow(entry)], { onConflict: 'id' })
      .select()
      .single();

    if (error) throw error;
    return fromRow(data);
  },
};
