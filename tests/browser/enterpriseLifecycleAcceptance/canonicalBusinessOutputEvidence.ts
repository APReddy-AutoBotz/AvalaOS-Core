const UUID_PATTERN = String.raw`\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b`;
const DIGEST_PATTERN = String.raw`\b(?:sha256:)?[0-9a-f]{64}\b`;
const BEARER_PATTERN = String.raw`\bBearer\s+[A-Za-z0-9._~-]+\b`;
const JWT_PATTERN = String.raw`\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b`;
const SYNTHETIC_PERSONA_EMAIL_PATTERN = String.raw`\b[A-Za-z0-9._%+-]+@example\.invalid\b`;
const SIGNED_QUERY_VALUE_PATTERN = String.raw`([?&](?:token|signature|sig|x-amz-signature|x-amz-credential|x-amz-security-token|x-goog-signature|expires)=)[^&\s)]+`;
const UNREDACTED_SIGNED_QUERY_VALUE_PATTERN = String.raw`([?&](?:token|signature|sig|x-amz-signature|x-amz-credential|x-amz-security-token|x-goog-signature|expires)=)(?!\[credential omitted\])[^&\s)]+`;

const replaceAll = (input: string, pattern: string, replacement: string) => input
  .replace(new RegExp(pattern, 'giu'), replacement);

const containsSensitiveEvidence = (input: string) => [
  UUID_PATTERN,
  DIGEST_PATTERN,
  BEARER_PATTERN,
  JWT_PATTERN,
  SYNTHETIC_PERSONA_EMAIL_PATTERN,
].some(pattern => new RegExp(pattern, 'iu').test(input))
  || new RegExp(UNREDACTED_SIGNED_QUERY_VALUE_PATTERN, 'iu').test(input);

export type ApprovedBusinessOutputSection = Readonly<{
  heading: string;
  body: string;
}>;

export type ApprovedDeliveryItemEvidence = Readonly<{
  title: string;
  description: string;
  acceptanceCriteria: readonly string[];
  nonFunctionalRequirements: readonly string[];
  sourceCitation: string;
  decision: string;
  history: string;
}>;

export const validateApprovedDeliveryItemEvidence = (
  items: readonly ApprovedDeliveryItemEvidence[],
  expectedCount = 5,
) => {
  if (items.length !== expectedCount) {
    throw new Error('CANONICAL_APPROVED_DELIVERY_ITEM_COUNT_MISMATCH');
  }
  for (const item of items) {
    if (!item.title.trim()
      || !item.description.trim()
      || !Array.isArray(item.acceptanceCriteria)
      || item.acceptanceCriteria.some(value => typeof value !== 'string' || !value.trim())
      || !Array.isArray(item.nonFunctionalRequirements)
      || item.nonFunctionalRequirements.some(value => typeof value !== 'string' || !value.trim())
      || !/^Source citation:/u.test(item.sourceCitation.trim())
      || !/^Decision: accepted\b/u.test(item.decision.trim())
      || !/^Immutable history\b/u.test(item.history.trim())) {
      throw new Error('CANONICAL_APPROVED_DELIVERY_ITEM_CONTENT_INCOMPLETE');
    }
  }
  return items;
};

export const sanitizeApprovedBusinessOutputText = (input: string) => {
  let sanitized = input.replaceAll('\r\n', '\n');
  sanitized = replaceAll(sanitized, UUID_PATTERN, '[identifier omitted from sanitized evidence]');
  sanitized = replaceAll(sanitized, DIGEST_PATTERN, '[digest omitted from sanitized evidence]');
  sanitized = replaceAll(sanitized, BEARER_PATTERN, 'Bearer [credential omitted]');
  sanitized = replaceAll(sanitized, JWT_PATTERN, '[token omitted from sanitized evidence]');
  sanitized = replaceAll(sanitized, SYNTHETIC_PERSONA_EMAIL_PATTERN, '[synthetic persona email omitted]');
  sanitized = replaceAll(sanitized, SIGNED_QUERY_VALUE_PATTERN, '$1[credential omitted]');
  return sanitized.split('\n').map(line => line.trimEnd()).join('\n').trim();
};

export const approvedBusinessOutputMarkdown = ({
  title,
  approvalState,
  contentOrigin,
  sections,
  remainingGaps,
}: Readonly<{
  title: string;
  approvalState: string;
  contentOrigin: string;
  sections: readonly ApprovedBusinessOutputSection[];
  remainingGaps: readonly string[];
}>) => {
  if (!title.trim() || !approvalState.trim() || !contentOrigin.trim() || sections.length === 0) {
    throw new Error('CANONICAL_APPROVED_BUSINESS_OUTPUT_INCOMPLETE');
  }
  const sanitizedSections = sections.map(section => {
    const heading = sanitizeApprovedBusinessOutputText(section.heading);
    const body = sanitizeApprovedBusinessOutputText(section.body);
    if (!heading || !body) throw new Error('CANONICAL_APPROVED_BUSINESS_OUTPUT_SECTION_INCOMPLETE');
    return `## ${heading}\n\n${body}`;
  });
  const gaps = remainingGaps.length
    ? remainingGaps.map(gap => `- ${sanitizeApprovedBusinessOutputText(gap)}`).join('\n')
    : '- No content gaps were recorded by this evidence capture.';
  const capturedContent = sections.map(section => section.body).join('\n');
  const retainedProvisionalEvaluationGap = /Provisional\s*\|\s*Partially Evidenced/iu.test(capturedContent)
    && /independent evidence and governance review not yet completed/iu.test(capturedContent)
    && /Independent review:\s*pending/iu.test(capturedContent)
    ? [
      '- The approval applies to the current case/version and completed Govern control record. The frozen evaluation snapshot still says “Provisional | Partially Evidenced”, “independent evidence and governance review not yet completed”, and “Independent review: pending”.',
      '- That retained snapshot contains generic AP evidence and recommendations, including “Review exception”, “Incomplete request”, and a controlled hybrid recommendation. The capture does not rewrite those statements; case-specific source evidence and a refreshed evaluation remain business-content gaps.',
    ].join('\n')
    : '';
  const markdown = [
    `# ${sanitizeApprovedBusinessOutputText(title)}`,
    '',
    `Approval state: ${sanitizeApprovedBusinessOutputText(approvalState)}`,
    '',
    `Content origin: ${sanitizeApprovedBusinessOutputText(contentOrigin)}`,
    '',
    ...sanitizedSections.flatMap(section => [section, '']),
    '## Remaining content gaps',
    '',
    gaps,
    ...(retainedProvisionalEvaluationGap ? [retainedProvisionalEvaluationGap] : []),
    '',
  ].join('\n');
  if (containsSensitiveEvidence(markdown)) {
    throw new Error('CANONICAL_APPROVED_BUSINESS_OUTPUT_SANITIZATION_FAILED');
  }
  return markdown;
};
