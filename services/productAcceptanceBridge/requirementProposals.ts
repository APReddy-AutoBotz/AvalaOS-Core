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
const numberedRequirement = /^(\d+)[.)]\s+\S/iu;
const numberedImperative = /^\d+[.)]\s+(?:accept|acknowledge|address|allow|apply|approve|assign|authenticate|authorize|calculate|capture|classify|collect|compare|complete|configure|confirm|create|detect|disable|display|document|draft|enforce|ensure|exclude|extract|generate|handle|identify|import|keep|log|maintain|notify|persist|preserve|prevent|publish|record|reject|require|resolve|restrict|retain|retrieve|review|route|save|send|store|support|track|update|use|validate|verify|withhold)\b/iu;
const markdownHeading = /^#{1,6}\s+/u;
const speculativeStatement = /^(?:[-*+]\s*|\d+[.)]\s*)?(?:(?:open\s+)?question|assume|assumption|proposal|proposed|speculative)(?:\s|[:.\-]|$)/iu;
const excludedSectionPurpose = /(?:^|\s)(?:questions?|assumptions?|proposals?|flows?|diagrams?)(?:\s|$)/iu;
const mermaidFlow = /^\s*(?:flowchart|graph)\s+/imu;
const unresolvedSectionPurpose = /(?:^|\s)(?:open\s+)?(?:questions?|unknowns?|unresolved)(?:\s|$)/iu;
const unresolvedQuestion = /^(?:[-*+]\s*|\d+[.)]\s*)?(?:(?:open\s+)?question|unknown|unresolved)(?:\s*[:.\-]\s*|\s+)/iu;
const explicitRequirementSection = /(?:^|\s)requirements?(?:\s|$)/iu;
const sourceFactsSentinel = 'Source facts from the accepted Assess handoff (for human review; not model-generated reasoning):';

export const isApprovedRequirementLine = (line: string) => {
  const value = line.trim();
  return value.length > 0 && value.length <= 2_000 && !markdownHeading.test(value)
    && !value.endsWith('?') && !speculativeStatement.test(value)
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

const referencedRequirementIdentifiers = (line: string) => {
  const content = line.replace(/^(?:[-*+]\s*|\d+[.)]\s*)?(?:REQ|BR|FR|NFR|AC)[-_ ]?\d+\s*[:.\-]\s*/iu, '');
  return [...content.matchAll(/(?:^|[^A-Z0-9])((?:REQ|BR|FR|NFR)[-_ ]?\d+)(?=$|[^A-Z0-9])/giu)]
    .map(match => match[1].toUpperCase().replace(/[-_ ]+/u, '-'));
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
    const section = { id: id.trim(), title: title.trim(), body };
    const purpose = `${section.id.replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/[-_]+/gu, ' ')} ${section.title}`;
    if (excludedSectionPurpose.test(purpose) || mermaidFlow.test(section.body)) return [];
    return [section];
  });
};

const sectionPurpose = (section: ApprovedSection) => `${section.id.replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/[-_]+/gu, ' ')} ${section.title}`;

const sectionLines = (section: ApprovedSection) => {
  const lines = section.body.split(/\r?\n/u);
  const sentinelIndex = lines.findIndex(line => line.trim() === sourceFactsSentinel);
  return sentinelIndex < 0 ? lines : lines.slice(0, sentinelIndex);
};

const unresolvedQuestionLinks = (content: Record<string, unknown>): StudioDeliveryRequirementLink[] => {
  if (!Array.isArray(content.sections)) return [];
  return content.sections.flatMap(value => {
    if (!record(value)) return [];
    const id = text(value.id) ?? text(value.key);
    const title = text(value.title);
    const body = text(value.body) ?? text(value.content);
    if (!id?.trim() || !title?.trim() || body === null || mermaidFlow.test(body)) return [];
    const purpose = `${id.replace(/([a-z])([A-Z])/gu, '$1 $2')} ${title}`;
    if (!unresolvedSectionPurpose.test(purpose)) return [];
    return body.split(/\r?\n/u).map(line => line.trim()).filter(line => line.length > 0 && line.length <= 2_000
      && (unresolvedQuestion.test(line) || line.endsWith('?'))).map(requirementText => ({
      sectionId: id.trim(), sectionTitle: title.trim(), requirementText,
    }));
  });
};

const title = (prefix: string, value: string) => {
  const candidate = `${prefix}${value}`.trim();
  return candidate.length <= 300 ? candidate : `${candidate.slice(0, 297).trimEnd()}…`;
};

const linksFor = (section: ApprovedSection, hasExplicitRequirementSection: boolean): StudioDeliveryRequirementLink[] => sectionLines(section)
  .map(line => line.trim())
  .filter(line => {
    if (!line || line.length > 2_000 || markdownHeading.test(line) || line.endsWith('?') || speculativeStatement.test(line)) return false;
    if (requirementId.test(line)) return true;
    if (!hasExplicitRequirementSection) return normativeRequirement.test(line);
    if (!explicitRequirementSection.test(sectionPurpose(section))) return false;
    return normativeRequirement.test(line) || numberedImperative.test(line);
  })
  .map(requirementText => ({ sectionId: section.id, sectionTitle: section.title, requirementText }));

export const deriveRequirementProposals = (content: Record<string, unknown>): RequirementProposalResult => {
  const candidateSections = approvedSections(content);
  const hasExplicitRequirementSection = candidateSections.some(section => explicitRequirementSection.test(sectionPurpose(section)));
  const sections = candidateSections.map(section => ({ section, links: linksFor(section, hasExplicitRequirementSection) }))
    .filter(value => value.links.length > 0);
  const requirementCount = sections.reduce((total, value) => total + value.links.length, 0);
  if (requirementCount === 0) return {
    proposals: [], requirementCount: 0,
    blockedReason: 'No explicit requirement statement was found. Add an approved REQ/FR/NFR/AC line or a statement using must, shall, required to, or needs to.',
  };

  const numberedIdentities = new Map<string, StudioDeliveryRequirementLink[]>();
  sections.forEach(({ section, links }) => {
    if (!explicitRequirementSection.test(sectionPurpose(section))) return;
    links.forEach(link => {
      if (requirementId.test(link.requirementText) || !numberedRequirement.test(link.requirementText)
        || (!numberedImperative.test(link.requirementText) && !normativeRequirement.test(link.requirementText))) return;
      const identity = link.requirementText.match(numberedRequirement)?.[1];
      if (identity) numberedIdentities.set(identity, [...(numberedIdentities.get(identity) ?? []), link]);
    });
  });
  const duplicateNumber = [...numberedIdentities.entries()].find(([, links]) => links.length > 1);
  if (duplicateNumber) return {
    proposals: [], requirementCount,
    blockedReason: `Approved numbered requirement identity “${duplicateNumber[0]}” appears more than once. Number each approved requirement uniquely before publishing.`,
  };

  const allLinks = sections.flatMap(({ links }) => links);
  const deliverableLinks = allLinks.filter(link => !isAcceptanceLink(link));
  const acceptanceLinks = allLinks.filter(isAcceptanceLink);
  if (deliverableLinks.length === 0) return {
    proposals: [], requirementCount,
    blockedReason: 'Acceptance statements were found, but no approved deliverable requirement was found. Add an approved REQ/BR/FR/NFR line or a deliverable statement using must, shall, required to, or needs to.',
  };

  const usedAcceptance = new Set<StudioDeliveryRequirementLink>();
  const deliverablesByIdentifier = new Map<string, StudioDeliveryRequirementLink[]>();
  deliverableLinks.forEach(link => {
    const identifier = requirementIdentifier(link.requirementText);
    if (identifier) deliverablesByIdentifier.set(identifier, [...(deliverablesByIdentifier.get(identifier) ?? []), link]);
  });
  const explicitReferences = new Map(acceptanceLinks.map(candidate =>
    [candidate, referencedRequirementIdentifiers(candidate.requirementText)] as const));
  const explicitlyReferencedAcceptance = new Set(acceptanceLinks.filter(candidate =>
    (explicitReferences.get(candidate)?.length ?? 0) > 0));
  const globallyResolvedAcceptance = new Set(acceptanceLinks.filter(candidate => {
    const references = explicitReferences.get(candidate) ?? [];
    return references.length > 0 && references.every(reference => deliverablesByIdentifier.get(reference)?.length === 1);
  }));
  const pairedAcceptance = deliverableLinks.map(link => {
    const identifier = requirementIdentifier(link.requirementText);
    const explicitlyLinked = identifier === null ? [] : acceptanceLinks.filter(candidate =>
      globallyResolvedAcceptance.has(candidate) && explicitlyReferences(candidate.requirementText, identifier));
    const sameSectionDeliverables = deliverableLinks.filter(candidate => candidate.sectionId === link.sectionId);
    const unambiguousSectionLinks = explicitlyLinked.length === 0 && sameSectionDeliverables.length === 1
      ? acceptanceLinks.filter(candidate => !usedAcceptance.has(candidate)
        && !explicitlyReferencedAcceptance.has(candidate) && candidate.sectionId === link.sectionId)
      : [];
    const paired = explicitlyLinked.length > 0 ? explicitlyLinked : unambiguousSectionLinks;
    paired.forEach(candidate => usedAcceptance.add(candidate));
    return paired;
  });

  const resolvedLinks = allLinks.filter(link => !isAcceptanceLink(link) || usedAcceptance.has(link));
  const proposals: StudioDeliveryApprovedWorkItem[] = [];
  const implementationIndexByIdentifier = new Map<string, number>();
  const firstDeliverable = deliverable(deliverableLinks[0].requirementText);
  proposals.push({
    proposalRole: 'coordination',
    type: 'Epic',
    title: title('Deliver outcome — ', firstDeliverable),
    description: `Coordinate ${deliverableLinks.length} approved deliverable${deliverableLinks.length === 1 ? '' : 's'}, beginning with “${firstDeliverable}”. Every included outcome remains linked to its exact approved requirement.`,
    acceptanceCriteria: deliverableLinks.map(link => `Delivered behavior satisfies: ${displayRequirement(link.requirementText)}`),
    requirementLinks: resolvedLinks,
  });
  deliverableLinks.forEach((link, index) => {
    const requirement = deliverable(link.requirementText);
    const linkedAcceptance = pairedAcceptance[index];
    const proposalIndex = proposals.length;
    proposals.push({
      proposalRole: 'implementation',
      type: 'Story', title: title('Implement — ', requirement),
      description: `Deliver the approved behavior: ${displayRequirement(link.requirementText)}`,
      acceptanceCriteria: linkedAcceptance.length > 0
        ? linkedAcceptance.map(candidate => displayRequirement(candidate.requirementText))
        : [`The delivered behavior satisfies the approved predicate: ${displayRequirement(link.requirementText)}`],
      requirementLinks: [link, ...linkedAcceptance],
    });
    const identifier = requirementIdentifier(link.requirementText);
    if (identifier && deliverablesByIdentifier.get(identifier)?.length === 1) {
      implementationIndexByIdentifier.set(identifier, proposalIndex);
    }
  });
  const unassignedAcceptance = acceptanceLinks.filter(link => !usedAcceptance.has(link));
  if (unassignedAcceptance.length > 0) proposals.push({
    proposalRole: 'acceptance-review',
    type: 'Task',
    title: title('Review unassigned acceptance criteria — ', displayRequirement(unassignedAcceptance[0].requirementText)),
    description: `${unassignedAcceptance.length} approved acceptance ${unassignedAcceptance.length === 1 ? 'criterion has' : 'criteria have'} no explicit or unambiguous requirement association. A human must assign or retain each criterion before confirmation.`,
    acceptanceCriteria: unassignedAcceptance.map(link => `Human reviewed association for: ${displayRequirement(link.requirementText)}`),
    requirementLinks: unassignedAcceptance,
  });
  const questionLinks = unresolvedQuestionLinks(content);
  questionLinks.forEach(link => {
    const discoveryIndex = proposals.length;
    const question = displayRequirement(link.requirementText.replace(unresolvedQuestion, ''));
    proposals.push({
      proposalRole: 'discovery', type: 'Task', title: title('Resolve — ', question),
      description: `Resolve the approved unanswered question before dependent implementation is treated as ready: ${question}`,
      acceptanceCriteria: [`A human records a source-backed answer or explicitly retains the question as unresolved: ${question}`],
      requirementLinks: [link],
    });
    referencedRequirementIdentifiers(link.requirementText).forEach(identifier => {
      const implementationIndex = implementationIndexByIdentifier.get(identifier);
      if (implementationIndex === undefined) return;
      const implementation = proposals[implementationIndex];
      implementation.dependencyProposalIndices = [...(implementation.dependencyProposalIndices ?? []), discoveryIndex];
    });
  });
  proposals.push({
    proposalRole: 'verification',
    type: 'Task',
    title: title('Verify outcome — ', firstDeliverable),
    description: `Verify the delivered behavior against the ${resolvedLinks.length} approved requirement and acceptance references listed below.`,
    acceptanceCriteria: [...new Set(proposals.filter(item => item.proposalRole === 'implementation')
      .flatMap(item => item.acceptanceCriteria))],
    requirementLinks: resolvedLinks,
  });

  if (proposals.length > 100) return {
    proposals: [], requirementCount,
    blockedReason: `The approved artifact would produce ${proposals.length} proposals, above the 100-item publication limit. Split the approved requirements before publishing.`,
  };
  return { proposals, requirementCount, blockedReason: null };
};
