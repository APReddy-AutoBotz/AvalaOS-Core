const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const CANONICAL_DATABASE_LINEAGE_BOOLEAN_KEYS = Object.freeze([
  'exactApprovedPackage', 'exactEditedStudioVersion', 'exactAssessGovernAncestry', 'singleHandoffConsumption',
  'independentPackageApproval', 'exactAcceptedItemVersions', 'readOnlyMonitorTruth', 'singleBaselineEffect',
  'providersOff',
]);

// Read committed authority independently of browser assertions. Return only
// counts/booleans; selectors, hashes and identities remain inside the database boundary.
export async function readCanonicalInvoiceExceptionLineageEvidence(query,
  { organizationId, workspaceId, processId }) {
  if (typeof query !== 'function' || ![organizationId,workspaceId,processId].every(value=>UUID.test(value??''))) {
    throw new Error('CANONICAL_PROCESS_BINDING_MISSING');
  }
  const { rows } = await query(`
    SELECT count(*)::int AS "baselineCount",
      COALESCE(bool_and(p.status='approved' AND pv.status='approved'
        AND p.current_version_id=b.work_package_version_id AND pv.content_hash=b.package_hash),false) AS "exactApprovedPackage",
      COALESCE(bool_and(s.source_mode='studio_handoff' AND s.legacy_handoff_id IS NULL
        AND s.studio_artifact_version_id=a.current_approved_version_id
        AND av.id=a.current_version_id AND av.version=2 AND av.parent_version_id IS NOT NULL
        AND av.content_hash=s.studio_artifact_hash AND a.lifecycle='approved'),false) AS "exactEditedStudioVersion",
      COALESCE(bool_and(c.process_id=$3 AND a.source_version_id=d.source_version_id
        AND a.review_resolution_id=r.id AND r.resolution='approved'
        AND a.govern_resolution_id=g.id AND g.decision_id=d.id),false) AS "exactAssessGovernAncestry",
      COALESCE(bool_and(h.status='consumed' AND (SELECT count(*) FROM public.enterprise_delivery_handoff_consumptions hc
        WHERE hc.handoff_id=h.id AND hc.org_id=$1 AND hc.workspace_id=$2)=1
        AND EXISTS(SELECT 1 FROM public.enterprise_delivery_handoff_consumptions hc
          JOIN public.enterprise_delivery_handoff_review_events hr ON hr.handoff_id=hc.handoff_id
          JOIN public.enterprise_delivery_handoff_approval_events ha ON ha.handoff_id=hc.handoff_id
          WHERE hc.handoff_id=h.id AND hc.work_package_id=p.id
            AND hc.consumed_by NOT IN(h.requested_by,hr.reviewer_id,ha.approved_by))),false) AS "singleHandoffConsumption",
      COALESCE(bool_and(pa.outcome='approved' AND pr.outcome='approved'
        AND pa.created_by<>pa.reviewed_by AND pa.created_by<>pa.approved_by AND pa.reviewed_by<>pa.approved_by
        AND pa.review_event_id=pr.id AND pa.accepted_set_hash=b.accepted_set_hash),false) AS "independentPackageApproval",
      COALESCE(bool_and(b.accepted_item_count>0 AND b.accepted_item_count=(SELECT count(*)
        FROM public.enterprise_monitor_baseline_items bi WHERE bi.baseline_id=b.id)
        AND b.accepted_set_hash=public.enterprise_sha256_jsonb(jsonb_build_object(
          'contract','delivery-accepted-set-2','acceptedItemCount',b.accepted_item_count,
          'items',public.enterprise_pr_c_accepted_item_manifest(p.id,$1,$2,true)))) ,false) AS "exactAcceptedItemVersions",
      COALESCE(bool_and(NOT b.live_telemetry_connected AND b.status='approved'),false) AS "readOnlyMonitorTruth",
      COALESCE(bool_and((SELECT count(*) FROM public.enterprise_delivery_monitor_command_receipts cr
        WHERE cr.resource_id=b.id AND cr.action='monitor.baseline.create' AND cr.status='committed')=1),false) AS "singleBaselineEffect"
    FROM public.enterprise_monitor_baselines b
    JOIN public.enterprise_delivery_work_packages p ON p.id=b.work_package_id AND p.org_id=b.org_id AND p.workspace_id=b.workspace_id
    JOIN public.enterprise_delivery_work_package_versions pv ON pv.id=b.work_package_version_id
    JOIN public.enterprise_delivery_source_packages s ON s.id=b.source_package_id
    JOIN public.enterprise_delivery_handoffs h ON h.id=s.delivery_handoff_id
    JOIN public.studio_artifact_aggregates a ON a.id=s.studio_artifact_id
    JOIN public.studio_artifact_versions av ON av.id=s.studio_artifact_version_id
    JOIN public.assess_v2_cases c ON c.id=a.case_id
    JOIN public.assess_v2_decision_versions d ON d.id=a.decision_id
    JOIN public.assess_v2_review_resolutions r ON r.id=a.review_resolution_id
    JOIN public.assess_v2_govern_resolutions g ON g.id=a.govern_resolution_id
    JOIN public.enterprise_delivery_package_approval_events pa ON pa.id=b.package_approval_id
    JOIN public.enterprise_delivery_package_review_events pr ON pr.id=pa.review_event_id
    WHERE b.org_id=$1 AND b.workspace_id=$2 AND c.process_id=$3`,
  [organizationId,workspaceId,processId]);
  const summary = rows[0];
  const provider = (await query(`SELECT
    NOT (SELECT provider_enabled FROM public.studio_artifact_runtime_control WHERE singleton)
    AND NOT (SELECT provider_enabled FROM public.enterprise_intelligence_runtime_control WHERE singleton) AS "providersOff"`)).rows[0];
  const evidence={...summary,...provider};
  if(!Number.isSafeInteger(evidence.baselineCount)||evidence.baselineCount<0
    ||CANONICAL_DATABASE_LINEAGE_BOOLEAN_KEYS.some(key=>typeof evidence[key]!=='boolean')
    ||Object.keys(evidence).length!==CANONICAL_DATABASE_LINEAGE_BOOLEAN_KEYS.length+1){
    throw new Error('CANONICAL_DATABASE_EVIDENCE_REJECTED');
  }
  return Object.freeze(evidence);
}

export async function readCanonicalInvoiceExceptionDatabaseEvidence(fixture, projectName) {
  const processId = fixture.expectedBrowserCaseProcesses().find(row => row.projectName === projectName)?.processId;
  if (!processId) throw new Error('CANONICAL_PROCESS_BINDING_MISSING');
  const lineage=await readCanonicalInvoiceExceptionLineageEvidence(fixture.db.query.bind(fixture.db),{
    organizationId:fixture.ids.organization,workspaceId:fixture.ids.workspace,processId,
  });
  return { ...lineage,
    noProviderEgress: fixture.evidence.providerEffects.egress === 0 && fixture.evidence.providerEffects.egressAttempts === 0
      && fixture.evidence.providerEffects.paidCalls === 0 && fixture.evidence.providerEffects.realProviderAllowed === false };
}

export const canonicalDatabaseLineageEvidencePassed = evidence => evidence?.baselineCount === 1
  && CANONICAL_DATABASE_LINEAGE_BOOLEAN_KEYS.every(key => evidence[key] === true);

export const canonicalDatabaseEvidencePassed = evidence => canonicalDatabaseLineageEvidencePassed(evidence)
  && evidence.noProviderEgress === true;
