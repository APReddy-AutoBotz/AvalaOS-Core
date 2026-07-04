import {
  type BuyerAcceptanceAdminWalkthroughSnapshot,
  type BuyerAcceptanceWalkthroughFinding,
  type BuyerAcceptanceWalkthroughStatus,
  type BuyerAcceptanceWalkthroughStep,
} from './buyerAcceptanceAdminWalkthrough';
import {
  ADMIN_WORKBENCH_SECTIONS,
  type AdminSectionKey,
} from './adminWorkbenchModel';

export interface BuyerAcceptanceWalkthroughStepGroup {
  adminSectionKey: AdminSectionKey;
  label: string;
  steps: readonly BuyerAcceptanceWalkthroughStep[];
}

const walkthroughStatusLabels: Record<BuyerAcceptanceWalkthroughStatus, string> = {
  evidence_required: 'Evidence Required',
  rehearsal_required: 'Rehearsal Required',
  blocked: 'Blocked',
};

const unsupportedPositiveClaimPatterns: readonly RegExp[] = [
  /production ready/i,
  /hosted ready/i,
  /deployment ready/i,
  /RLS ready/i,
  /RLS active/i,
  /RLS verified/i,
  /tenant isolation verified/i,
  /security ready/i,
  /buyer ready/i,
  /product ready/i,
  /release-candidate ready/i,
  /compliance certified/i,
  /approved for buyer use/i,
  /export available/i,
  /download available/i,
  /PDF available/i,
  /screenshot evidence captured/i,
  /browser walkthrough verified/i,
  new RegExp('Avala Govern' + ' Lite', 'i'),
  new RegExp('Avala Delivery' + ' Lite', 'i'),
];

function adminSectionLabel(sectionKey: AdminSectionKey): string {
  return ADMIN_WORKBENCH_SECTIONS.find(section => section.key === sectionKey)?.label || sectionKey;
}

export function getWalkthroughStatusLabel(status: BuyerAcceptanceWalkthroughStatus): string {
  return walkthroughStatusLabels[status];
}

export function getWalkthroughStepLabel(step: BuyerAcceptanceWalkthroughStep): string {
  return step.title;
}

export function getWalkthroughFindingStatusLabel(status: BuyerAcceptanceWalkthroughStatus): string {
  return walkthroughStatusLabels[status];
}

export function groupWalkthroughStepsByAdminSection(
  walkthrough: BuyerAcceptanceAdminWalkthroughSnapshot,
): readonly BuyerAcceptanceWalkthroughStepGroup[] {
  return walkthrough.adminSectionOrder
    .map(sectionKey => ({
      adminSectionKey: sectionKey,
      label: adminSectionLabel(sectionKey),
      steps: walkthrough.steps.filter(step => step.adminSectionKey === sectionKey),
    }))
    .filter(group => group.steps.length > 0);
}

export function getWalkthroughExportBlockers(walkthrough: BuyerAcceptanceAdminWalkthroughSnapshot): readonly string[] {
  return [...walkthrough.exportBlockers];
}

export function getWalkthroughReadinessBlockers(walkthrough: BuyerAcceptanceAdminWalkthroughSnapshot): readonly string[] {
  return [...walkthrough.readinessBlockers];
}

export function getWalkthroughDeferredTracks(walkthrough: BuyerAcceptanceAdminWalkthroughSnapshot): readonly string[] {
  return [...walkthrough.deferredTracks];
}

export function getWalkthroughFindingsRequiredBeforeExport(
  walkthrough: BuyerAcceptanceAdminWalkthroughSnapshot,
): readonly BuyerAcceptanceWalkthroughFinding[] {
  return walkthrough.findings.filter(finding => finding.requiredBeforeExport);
}

export function getWalkthroughFindingsRequiredBeforeBuyerSignoff(
  walkthrough: BuyerAcceptanceAdminWalkthroughSnapshot,
): readonly BuyerAcceptanceWalkthroughFinding[] {
  return walkthrough.findings.filter(finding => finding.requiredBeforeBuyerSignoff);
}

export function summarizeAdminWalkthroughStatus(walkthrough: BuyerAcceptanceAdminWalkthroughSnapshot): string {
  return `${getWalkthroughStatusLabel(walkthrough.walkthroughStatus)}. This is a read-only internal rehearsal for the Admin buyer-review journey; export/PDF/download remains blocked, browser automation is not implemented, screenshot capture is not implemented, and the walkthrough is not an approval, not readiness evidence, and not compliance evidence.`;
}

export function assertAdminWalkthroughNotReady(walkthrough: BuyerAcceptanceAdminWalkthroughSnapshot): void {
  const status = walkthrough.walkthroughStatus as string;
  if (status === 'ready' || status === 'success') {
    throw new Error('Admin Walkthrough must not be marked ready or successful in the current baseline.');
  }
}

export function assertAdminWalkthroughHasExportBlockers(walkthrough: BuyerAcceptanceAdminWalkthroughSnapshot): void {
  if (walkthrough.exportBlockers.length === 0) {
    throw new Error('Admin Walkthrough must keep export/PDF/download blockers in the current baseline.');
  }
}

export function assertAdminWalkthroughHasReadinessBlockers(walkthrough: BuyerAcceptanceAdminWalkthroughSnapshot): void {
  if (walkthrough.readinessBlockers.length === 0) {
    throw new Error('Admin Walkthrough must keep readiness blockers in the current baseline.');
  }
}

export function assertAdminWalkthroughProofSafeCopy(walkthrough: BuyerAcceptanceAdminWalkthroughSnapshot): void {
  assertAdminWalkthroughNotReady(walkthrough);
  assertAdminWalkthroughHasExportBlockers(walkthrough);
  assertAdminWalkthroughHasReadinessBlockers(walkthrough);

  const presentationCopy = [
    getWalkthroughStatusLabel(walkthrough.walkthroughStatus),
    summarizeAdminWalkthroughStatus(walkthrough),
    walkthrough.summary,
    ...walkthrough.exportBlockers,
    ...walkthrough.readinessBlockers,
    ...walkthrough.deferredTracks,
    ...walkthrough.steps.flatMap(step => [
      getWalkthroughStepLabel(step),
      getWalkthroughStatusLabel(step.status),
      adminSectionLabel(step.adminSectionKey),
      step.instruction,
      step.expectedObservation,
      step.evidenceReference,
      ...step.mustConfirm,
      ...step.blockedActions,
    ]),
    ...walkthrough.findings.flatMap(finding => [
      finding.label,
      getWalkthroughFindingStatusLabel(finding.status),
      finding.rationale,
    ]),
  ].join('\n');

  for (const pattern of unsupportedPositiveClaimPatterns) {
    if (pattern.test(presentationCopy)) {
      throw new Error(`Admin Walkthrough presentation copy contains unsupported claim wording: ${pattern}`);
    }
  }
}
