import type { StudioDeliveryApprovedWorkItem, StudioDeliveryRequirementLink } from './contracts';

export type RequirementProposalResult = {
  proposals: StudioDeliveryApprovedWorkItem[];
  requirementCount: number;
  blockedReason: string | null;
};

type ApprovedSection = { id: string; title: string; body: string };

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value : null;
const requirementId = /^(?:[-*+]\s*|\d+[.)]\s*)?(?:(?:REQ|BR|FR|NFR|AC)[-_ ]?\d+)\s*[:.\-]\s*\S/iu;
const normativeRequirement = /(?:^|\s)(?:must|shall|required to|needs to)(?:\s|$)/iu;
const markdownHeading = /^#{1,6}\s+/u;

export const isApprovedRequirementLine = (line: string) => {
  const value = line.trim();
  return value.length > 0 && value.length <= 2_000 && !markdownHeading.test(value)
    && (requirementId.test(value) || normativeRequirement.test(value));
};

const displayRequirement = (line: string) => line
  .replace(/^(?:[-*+]\s*|\d+[.)]\s*)/u, '')
  .replace(/^(?:(?:REQ|BR|FR|NFR|AC)[-_ ]?\d+)\s*[:.\-]\s*/iu, '')
  .trim();

const isAcceptanceLink = (link: StudioDeliveryRequirementLink) => /^(?:[-*+]\s*|\d+[.)]\s*)?AC[-_ ]?\d+\s*[:.\-]/iu.test(link.requirementText)
  || /acceptance(?:\s+criteria|\s+criterion)?/iu.test(link.sectionTitle);

const requirementIdentifier = (line: string) => {
  const match = line.match(/^(?:[-*+]\s*|\d+[.)]\s*)?((?:REQ|BR|FR|NFR|AC)[-_ ]?\d+)\s*[:.\-]/iu)?.[1];
  return match?.toUpperCase().replace(/[-_ ]+/u, '-') ?? null;
};

const explicitlyReferences = (line: string, identifier: string) => {
  const content = line.replace(/^(?:[-*+]\s*|\d+[.)]\s*)?(?:REQ|BR|FR|NFR|AC)[-_ ]?\d+\s*[:.\-]\s*/iu, '');
  const variants = identifier.replace('-', '[-_ ]?');
  return new RegExp(`(?:^|[^A-Z0-9])${variants}(?:$|[^A-Z0-9])`, 'iu').test(content);
};

const deliverable = (line: string) => {
  const value = displayRequirement(line).replace(/[.;:]$/u, '');
  const modal = value.match(/^(.*?)\s+(must|shall|required to|needs to)\s+(.+)$/iu);
  if (!modal) return value;
  const [, subject, , behavior] = modal;
  return `${subject.replace(/^the\s+/iu, '')}: ${behavior}`;
};

const approvedSections = (content: Record<string, unknown>): ApprovedSection[] => {
  if (!Array.isArray(content.sections)) return [];
  return content.sections.flatMap(value => {
    if (!record(value)) return [];
    const id = text(value.id) ?? text(value.key);
    const title = text(value.title);
    const body = text(value.body) ?? text(value.content);
    if (!id?.trim() || !title?.trim() || body === null) return [];
    return [{ id: id.trim(), title: title.trim(), body }];
  });
};

const title = (prefix: string, value: string) => {
  const candidate = `${prefix}${value}`.trim();
  return candidate.length <= 300 ? candidate : `${candidate.slice(0, 297).trimEnd()}…`;
};

const linksFor = (section: ApprovedSection): StudioDeliveryRequirementLink[] => section.body
  .split(/\r?\n/u)
  .map(line => line.trim())
  .filter(isApprovedRequirementLine)
  .map(requirementText => ({ sectionId: section.id, sectionTitle: section.title, requirementText }));

export const deriveRequirementProposals = (content: Record<string, unknown>): RequirementProposalResult => {
  const sections = approvedSections(content).map(section => ({ section, links: linksFor(section) })).filter(value => value.links.length > 0);
  const requirementCount = sections.reduce((total, value) => total + value.links.length, 0);
  if (requirementCount === 0) return {
    proposals: [], requirementCount: 0,
    blockedReason: 'No explicit requirement statement was found. Add an approved REQ/FR/NFR/AC line or a statement using must, shall, required to, or needs to.',
  };

  const allLinks = sections.flatMap(({ links }) => links);
  const deliverableLinks = allLinks.filter(link => !isAcceptanceLink(link));
  const acceptanceLinks = allLinks.filter(isAcceptanceLink);
  if (deliverableLinks.length === 0) return {
    proposals: [], requirementCount,
    blockedReason: 'Acceptance statements were found, but no approved deliverable requirement was found. Add an approved REQ/BR/FR/NFR line or a deliverable statement using must, shall, required to, or needs to.',
  };

  const usedAcceptance = new Set<StudioDeliveryRequirementLink>();
  const pairedAcceptance = deliverableLinks.map(link => {
    const identifier = requirementIdentifier(link.requirementText);
    const explicitlyLinked = identifier === null ? [] : acceptanceLinks.filter(candidate =>
      !usedAcceptance.has(candidate) && explicitlyReferences(candidate.requirementText, identifier));
    const sameSectionDeliverables = deliverableLinks.filter(candidate => candidate.sectionId === link.sectionId);
    const unambiguousSectionLinks = explicitlyLinked.length === 0 && sameSectionDeliverables.length === 1
      ? acceptanceLinks.filter(candidate => !usedAcceptance.has(candidate) && candidate.sectionId === link.sectionId)
      : [];
    const paired = explicitlyLinked.length > 0 ? explicitlyLinked : unambiguousSectionLinks;
    paired.forEach(candidate => usedAcceptance.add(candidate));
    return paired;
  });

  const proposals: StudioDeliveryApprovedWorkItem[] = [];
  const firstDeliverable = deliverable(deliverableLinks[0].requirementText);
  proposals.push({
    type: 'Epic',
    title: title('Deliver outcome — ', firstDeliverable),
    description: `Coordinate ${deliverableLinks.length} approved deliverable${deliverableLinks.length === 1 ? '' : 's'}, beginning with “${firstDeliverable}”. Every included outcome remains linked to its exact approved requirement.`,
    acceptanceCriteria: deliverableLinks.map(link => `Delivered behavior satisfies: ${displayRequirement(link.requirementText)}`),
    requirementLinks: allLinks,
  });
  deliverableLinks.forEach((link, index) => {
    const requirement = deliverable(link.requirementText);
    const linkedAcceptance = pairedAcceptance[index];
    proposals.push({
      type: 'Story', title: title('Implement — ', requirement),
      description: `Deliver the approved behavior: ${displayRequirement(link.requirementText)}`,
      acceptanceCriteria: linkedAcceptance.length > 0
        ? linkedAcceptance.map(candidate => displayRequirement(candidate.requirementText))
        : [`The delivered behavior satisfies the approved predicate: ${displayRequirement(link.requirementText)}`],
      requirementLinks: [link, ...linkedAcceptance],
    });
  });
  const unassignedAcceptance = acceptanceLinks.filter(link => !usedAcceptance.has(link));
  if (unassignedAcceptance.length > 0) proposals.push({
    type: 'Task',
    title: title('Review unassigned acceptance criteria — ', displayRequirement(unassignedAcceptance[0].requirementText)),
    description: `${unassignedAcceptance.length} approved acceptance ${unassignedAcceptance.length === 1 ? 'criterion has' : 'criteria have'} no explicit or unambiguous requirement association. A human must assign or retain each criterion before confirmation.`,
    acceptanceCriteria: unassignedAcceptance.map(link => `Human reviewed association for: ${displayRequirement(link.requirementText)}`),
    requirementLinks: unassignedAcceptance,
  });
  proposals.push({
    type: 'Task',
    title: title('Verify outcome — ', firstDeliverable),
    description: `Verify the delivered behavior against ${allLinks.length} exact approved requirement${allLinks.length === 1 ? '' : 's'}; do not infer missing technical design, policy, cost, or ROI.`,
    acceptanceCriteria: acceptanceLinks.length > 0
      ? acceptanceLinks.map(link => displayRequirement(link.requirementText))
      : deliverableLinks.map(link => `Verified against: ${displayRequirement(link.requirementText)}`),
    requirementLinks: allLinks,
  });

  if (proposals.length > 100) return {
    proposals: [], requirementCount,
    blockedReason: `The approved artifact would produce ${proposals.length} proposals, above the 100-item publication limit. Split the approved requirements before publishing.`,
  };
  return { proposals, requirementCount, blockedReason: null };
};
