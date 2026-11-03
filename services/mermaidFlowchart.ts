const MAX_MERMAID_FLOWCHARTS = 20;
const MAX_MERMAID_NODES = 200;
const MAX_MERMAID_EDGES = 400;

export type MermaidFlowchartNode = {
  id: string;
  label: string;
  kind: 'step' | 'decision';
  line: number;
};

export type MermaidFlowchartEdge = {
  from: string;
  to: string;
  branchLabel: string | null;
  line: number;
};

export type MermaidFlowchart = {
  direction: 'TB' | 'TD' | 'BT' | 'RL' | 'LR';
  headerLine: number;
  nodes: MermaidFlowchartNode[];
  edges: MermaidFlowchartEdge[];
};

type ParsedMermaidNode = MermaidFlowchartNode & { labelWasExplicit: boolean };

const mermaidFailure = (code: string, line: number) => new Error(`MERMAID_FLOWCHART_${code}_LINE_${line}`);

const normalizeMermaidLabel = (raw: string, line: number) => {
  let label = raw.trim();
  if ((label.startsWith('"') && label.endsWith('"')) || (label.startsWith("'") && label.endsWith("'"))) {
    label = label.slice(1, -1).trim();
  }
  if (!label || Array.from(label).length > 500 || /[\r\n\u0000]/.test(label) || /<[^>]*>/.test(label)) {
    throw mermaidFailure('LABEL_INVALID', line);
  }
  return label;
};

const parseMermaidNode = (raw: string, line: number): ParsedMermaidNode => {
  const match = raw.trim().match(/^([A-Za-z][A-Za-z0-9_-]*)(.*)$/);
  if (!match) throw mermaidFailure('NODE_INVALID', line);
  const id = match[1];
  const shape = match[2].trim();
  if (!shape) return { id, label: id, kind: 'step', line, labelWasExplicit: false };
  const decision = shape.match(/^\{\{?([\s\S]*?)\}\}?$/);
  if (decision) return { id, label: normalizeMermaidLabel(decision[1], line), kind: 'decision', line, labelWasExplicit: true };
  const shaped = shape.match(/^\(\[([\s\S]*?)\]\)$|^\[\[([\s\S]*?)\]\]$|^\[\(([\s\S]*?)\)\]$|^\(\(([\s\S]*?)\)\)$|^\[([\s\S]*?)\]$|^\(([\s\S]*?)\)$/);
  if (!shaped) throw mermaidFailure('NODE_SHAPE_UNSUPPORTED', line);
  const label = shaped.slice(1).find(value => value !== undefined);
  return { id, label: normalizeMermaidLabel(label || '', line), kind: 'step', line, labelWasExplicit: true };
};

const parseMermaidEdge = (lineText: string, line: number) => {
  const pipeLabel = lineText.match(/^(.+?)\s*-->\s*\|([^|\r\n]+)\|\s*(.+)$/);
  if (pipeLabel) return { from: parseMermaidNode(pipeLabel[1], line), to: parseMermaidNode(pipeLabel[3], line), branchLabel: normalizeMermaidLabel(pipeLabel[2], line) };
  const inlineLabel = lineText.match(/^(.+?)\s*--\s+(.+?)\s+-->\s*(.+)$/);
  if (inlineLabel) return { from: parseMermaidNode(inlineLabel[1], line), to: parseMermaidNode(inlineLabel[3], line), branchLabel: normalizeMermaidLabel(inlineLabel[2], line) };
  const unlabelled = lineText.match(/^(.+?)\s*-->\s*(.+)$/);
  if (unlabelled) return { from: parseMermaidNode(unlabelled[1], line), to: parseMermaidNode(unlabelled[2], line), branchLabel: null };
  return null;
};

const parseMermaidFlowchart = (lines: string[], firstLine: number): MermaidFlowchart => {
  const headerIndex = lines.findIndex(line => line.trim() && !line.trim().startsWith('%%'));
  if (headerIndex < 0) throw mermaidFailure('EMPTY', firstLine);
  const headerLine = firstLine + headerIndex;
  const header = lines[headerIndex].trim().match(/^(?:flowchart|graph)\s+(TB|TD|BT|RL|LR)\s*;?$/i);
  if (!header) throw mermaidFailure('HEADER_INVALID', headerLine);
  const nodes = new Map<string, ParsedMermaidNode>();
  const edges: MermaidFlowchartEdge[] = [];
  const register = (node: ParsedMermaidNode) => {
    const existing = nodes.get(node.id);
    if (!existing) {
      if (nodes.size >= MAX_MERMAID_NODES) throw mermaidFailure('NODE_LIMIT', node.line);
      nodes.set(node.id, node);
      return;
    }
    if (existing.labelWasExplicit && node.labelWasExplicit && (existing.label !== node.label || existing.kind !== node.kind)) {
      throw mermaidFailure('NODE_CONFLICT', node.line);
    }
    if (!existing.labelWasExplicit && node.labelWasExplicit) nodes.set(node.id, node);
  };
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = firstLine + index;
    const statement = lines[index].trim().replace(/;$/, '').trim();
    if (!statement || statement.startsWith('%%')) continue;
    const edge = parseMermaidEdge(statement, line);
    if (edge) {
      if (edges.length >= MAX_MERMAID_EDGES) throw mermaidFailure('EDGE_LIMIT', line);
      register(edge.from);
      register(edge.to);
      edges.push({ from: edge.from.id, to: edge.to.id, branchLabel: edge.branchLabel, line });
      continue;
    }
    register(parseMermaidNode(statement, line));
  }
  if (!nodes.size || !edges.length) throw mermaidFailure('CONTENT_INCOMPLETE', headerLine);
  for (const node of nodes.values()) {
    if (node.kind !== 'decision') continue;
    const branches = edges.filter(edge => edge.from === node.id);
    if (branches.length < 2) continue;
    if (branches.some(branch => !branch.branchLabel)) throw mermaidFailure('DECISION_BRANCH_LABEL_REQUIRED', node.line);
    const normalizedLabels = branches.map(branch => branch.branchLabel!.toLocaleLowerCase());
    if (new Set(normalizedLabels).size !== normalizedLabels.length) throw mermaidFailure('DECISION_BRANCH_LABEL_DUPLICATE', node.line);
  }
  return {
    direction: header[1].toUpperCase() as MermaidFlowchart['direction'],
    headerLine,
    nodes: Array.from(nodes.values(), ({ labelWasExplicit: _labelWasExplicit, ...node }) => node),
    edges,
  };
};

/**
 * Finds and validates the bounded Mermaid flowcharts supported as Assess source
 * material. Unsupported statements fail the source rather than silently
 * dropping a process step or decision branch.
 */
export const inspectMermaidFlowcharts = (text: string, allowBareFlowchart = true): MermaidFlowchart[] => {
  const lines = text.split('\n');
  const flowcharts: MermaidFlowchart[] = [];
  let insideOtherFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (insideOtherFence) {
      if (/^```\s*$/.test(trimmed)) insideOtherFence = false;
      continue;
    }
    if (/^```mermaid\s*$/i.test(trimmed)) {
      const closing = lines.findIndex((line, candidate) => candidate > index && /^```\s*$/.test(line.trim()));
      if (closing < 0) throw mermaidFailure('FENCE_UNTERMINATED', index + 1);
      if (flowcharts.length >= MAX_MERMAID_FLOWCHARTS) throw mermaidFailure('DOCUMENT_LIMIT', index + 1);
      flowcharts.push(parseMermaidFlowchart(lines.slice(index + 1, closing), index + 2));
      index = closing;
      continue;
    }
    if (/^```/.test(trimmed)) {
      insideOtherFence = true;
      continue;
    }
  }
  if (flowcharts.length) return flowcharts;
  const firstContent = lines.findIndex(line => line.trim() && !line.trim().startsWith('%%'));
  if (allowBareFlowchart && firstContent >= 0 && /^(?:flowchart|graph)\s+/i.test(lines[firstContent].trim())) {
    return [parseMermaidFlowchart(lines.slice(firstContent), firstContent + 1)];
  }
  return [];
};

export const inspectMermaidSourceText = (text: string, originalFilename?: string) => {
  const mermaidFile = originalFilename?.trim().toLocaleLowerCase().endsWith('.mmd') === true;
  const flowcharts = inspectMermaidFlowcharts(text, mermaidFile);
  if (mermaidFile && flowcharts.length === 0) throw mermaidFailure('HEADER_INVALID', 1);
  return flowcharts;
};
