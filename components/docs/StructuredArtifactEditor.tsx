import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  StudioArtifactSectionDto,
  StudioWorkspaceSelectedSourceDto,
} from "../../services/studioArtifacts/contracts";
import {
  contentToStructuredSections,
  structuredSectionsToContent,
  type StructuredStudioSection,
} from "../../services/studioArtifacts/workspaceModel";
import MermaidRenderer from "../shared/MermaidRenderer";
import { inspectMermaidFlowcharts } from "../../services/mermaidFlowchart";
import Modal from "../shared/Modal";

interface Props {
  content: Record<string, unknown>;
  readOnly?: boolean;
  saving?: boolean;
  announceStatus?: boolean;
  needsReview?: boolean;
  onRegenerateSelected?: (sectionIds: readonly string[]) => void;
  projectedSections?: readonly StudioArtifactSectionDto[];
  selectedSources?: readonly StudioWorkspaceSelectedSourceDto[];
  onCommit: (content: Record<string, unknown>) => void;
}

export default function StructuredArtifactEditor({
  content,
  projectedSections,
  selectedSources,
  readOnly = false,
  saving = false,
  announceStatus = true,
  needsReview = false,
  onRegenerateSelected,
  onCommit,
}: Props) {
  const initial = useMemo(
    () =>
      contentToStructuredSections(content, projectedSections, selectedSources),
    [content, projectedSections, selectedSources],
  );
  const [sections, setSections] = useState<StructuredStudioSection[]>(initial);
  const [selectedId, setSelectedId] = useState(initial[0]?.id || "");
  const [dirty, setDirty] = useState(false);
  const [selectedForUpdate, setSelectedForUpdate] = useState<Set<string>>(
    new Set(),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [pendingRegeneration, setPendingRegeneration] = useState<
    readonly string[] | null
  >(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const regenerateAfterSaveRef = useRef<readonly string[] | null>(null);
  useEffect(() => {
    setSections(initial);
    setSelectedId(initial[0]?.id || "");
    setDirty(false);
    setSelectedForUpdate(new Set());
    setPendingRegeneration(null);
    const requested = regenerateAfterSaveRef.current;
    if (requested) {
      regenerateAfterSaveRef.current = null;
      queueMicrotask(() => onRegenerateSelected?.(requested));
    }
  }, [initial]);
  const selectedIndex = Math.max(
    0,
    sections.findIndex((section) => section.id === selectedId),
  );
  const selected = sections[selectedIndex];
  const update = (patch: Partial<StructuredStudioSection>) => {
    setSections((current) =>
      current.map((section, index) =>
        index === selectedIndex ? { ...section, ...patch } : section,
      ),
    );
    setDirty(true);
  };
  const move = (delta: -1 | 1) => {
    const target = selectedIndex + delta;
    if (target < 0 || target >= sections.length) return;
    setSections((current) => {
      const next = [...current];
      [next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
      return next;
    });
    setDirty(true);
  };
  const remove = () => {
    if (sections.length <= 1) return;
    const next = sections.filter((_, index) => index !== selectedIndex);
    setSections(next);
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)].id);
    setDirty(true);
  };
  const add = () => {
    const id = `section-${crypto.randomUUID()}`;
    setSections((current) => [
      ...current,
      {
        id,
        title: "New section",
        body: "",
        sourceAnchors: [],
        labels: ["human_authored"],
      },
    ]);
    setSelectedId(id);
    setDirty(true);
  };
  const validatedContent = () => {
    const nextErrors = sections.flatMap((section, index) => {
      if (!section.title.trim()) return [`Section ${index + 1} needs a title.`];
      if (section.id === "asIsFlow" || section.id === "toBeFlow") {
        try {
          if (inspectMermaidFlowcharts(section.body, true).length !== 1)
            return [
              `${section.title} must contain one supported flowchart with at least one edge.`,
            ];
        } catch {
          return [
            `${section.title} contains unsupported or ambiguous Mermaid syntax.`,
          ];
        }
      }
      return [];
    });
    setErrors(nextErrors);
    if (nextErrors.length) {
      requestAnimationFrame(() => errorRef.current?.focus());
      return null;
    }
    return structuredSectionsToContent(content, sections);
  };
  const commit = () => {
    const next = validatedContent();
    if (next) onCommit(next);
  };
  const regenerate = () => {
    const selected = [...selectedForUpdate];
    if (dirty) {
      setPendingRegeneration(selected);
      return;
    }
    onRegenerateSelected?.(selected);
  };
  const saveThenRegenerate = () => {
    const next = validatedContent();
    if (!next || !pendingRegeneration) return;
    regenerateAfterSaveRef.current = pendingRegeneration;
    onCommit(next);
    setPendingRegeneration(null);
  };
  const discardThenRegenerate = () => {
    if (!pendingRegeneration) return;
    const requested = pendingRegeneration;
    setSections(initial);
    setDirty(false);
    setErrors([]);
    setPendingRegeneration(null);
    onRegenerateSelected?.(requested);
  };
  return (
    <section
      aria-label="Current document"
      className="mt-6 rounded-xl border border-[var(--av-color-border)] bg-[var(--av-color-surface)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4
            id="structured-editor-title"
            className="text-base font-bold text-[var(--av-color-text)]"
          >
            Current document
          </h4>
          <p className="mt-1 text-xs leading-5 text-[var(--av-color-text-muted)]">
            Edit the document and its source references. Flow diagrams are
            edited as Mermaid text and previewed graphically.
          </p>
        </div>
        <span
          role={announceStatus ? "status" : undefined}
          aria-live={announceStatus ? "polite" : undefined}
          className="text-xs font-bold text-[var(--av-color-text-muted)]"
        >
          {saving ? "Saving changes…" : dirty ? "Changes not saved" : "Saved"}
        </span>
      </div>
      {needsReview && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
        >
          <strong>Needs review.</strong> The sources changed after this document
          was saved. Select the affected sections to update. Unselected content
          and approved history are preserved.
          <fieldset className="mt-3 grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Sections selected for update</legend>
            {sections.map((section) => (
              <label key={section.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedForUpdate.has(section.id)}
                  disabled={readOnly}
                  onChange={(event) =>
                    setSelectedForUpdate((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(section.id);
                      else next.delete(section.id);
                      return next;
                    })
                  }
                />
                {section.title}
              </label>
            ))}
          </fieldset>
          {onRegenerateSelected && (
            <button
              type="button"
              disabled={readOnly || saving || selectedForUpdate.size === 0}
              onClick={regenerate}
              className="btn-primary mt-3 min-h-10 px-3 text-xs font-bold disabled:opacity-50"
            >
              Update selected sections
            </button>
          )}
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer font-semibold">
              Audit details
            </summary>
            <p className="mt-2">
              The server applies selected candidates atomically. Exact source
              bindings and approved revisions remain in History.
            </p>
          </details>
        </div>
      )}
      {pendingRegeneration && (
        <Modal
          isOpen
          title="Save or discard your changes"
          size="md"
          onClose={() => setPendingRegeneration(null)}
          contentClassName="p-5"
        >
          <p className="text-sm text-[var(--av-color-text)]">
            Updating selected sections would reload this document. Save all current
            changes before the update, or explicitly discard them.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary min-h-10 px-3 text-xs font-bold"
              onClick={saveThenRegenerate}
            >
              Save changes
            </button>
            <button
              type="button"
              className="btn-ghost min-h-10 px-3 text-xs font-bold"
              onClick={discardThenRegenerate}
            >
              Discard changes and update
            </button>
            <button
              type="button"
              className="btn-ghost min-h-10 px-3 text-xs font-bold"
              onClick={() => setPendingRegeneration(null)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
      {errors.length > 0 && (
        <div
          id="studio-editor-error-summary"
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="studio-editor-error-title"
          className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <p id="studio-editor-error-title" className="font-bold">
            Fix these issues before saving
          </p>
          <ul className="mt-2 list-disc pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)_minmax(240px,0.8fr)]">
        <nav aria-label="Document outline" className="min-w-0">
          <p className="av-eyebrow">Outline</p>
          <ol className="mt-2 max-h-72 space-y-1 overflow-y-auto">
            {sections.map((section, index) => (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(section.id)}
                  aria-current={
                    section.id === selectedId ? "location" : undefined
                  }
                  className={`min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${section.id === selectedId ? "bg-[var(--av-color-bg-subtle)] text-[var(--av-color-brand-primary)]" : "text-[var(--av-color-text-muted)]"}`}
                >
                  {index + 1}. {section.title || "Untitled section"}
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            disabled={readOnly || sections.length >= 100}
            onClick={add}
            className="btn-ghost mt-3 min-h-10 w-full text-xs font-bold disabled:opacity-50"
          >
            Add section
          </button>
        </nav>
        {selected && (
          <div className="min-w-0 space-y-3">
            <label className="av-form-label">
              Section title
              <input
                value={selected.title}
                disabled={readOnly}
                aria-invalid={errors.length > 0 && !selected.title.trim()}
                aria-describedby={
                  errors.length > 0 && !selected.title.trim()
                    ? "studio-editor-error-summary"
                    : undefined
                }
                aria-errormessage={
                  errors.length > 0 && !selected.title.trim()
                    ? "studio-editor-error-summary"
                    : undefined
                }
                onChange={(event) => update({ title: event.target.value })}
                className="av-input mt-2"
              />
            </label>
            <label className="av-form-label">
              Section body
              <textarea
                value={selected.body}
                disabled={readOnly}
                onChange={(event) => update({ body: event.target.value })}
                rows={8}
                className="av-input mt-2 resize-y"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={readOnly || selectedIndex === 0}
                onClick={() => move(-1)}
                className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50"
              >
                Move up
              </button>
              <button
                type="button"
                disabled={readOnly || selectedIndex === sections.length - 1}
                onClick={() => move(1)}
                className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50"
              >
                Move down
              </button>
              <button
                type="button"
                disabled={readOnly || sections.length <= 1}
                onClick={remove}
                className="btn-ghost min-h-10 px-3 text-xs font-bold disabled:opacity-50"
              >
                Remove section
              </button>
            </div>
          </div>
        )}
        {selected && (
          <aside
            aria-label="Source panel"
            className="min-w-0 rounded-lg border border-[var(--av-color-border)] bg-[var(--av-color-bg-subtle)] p-4"
          >
            <p className="av-eyebrow">View source</p>
            <p className="mt-3 text-xs font-bold text-[var(--av-color-text-muted)]">
              {selected.sourceAnchors.length} source citation
              {selected.sourceAnchors.length === 1 ? "" : "s"}
            </p>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-[var(--av-color-text-muted)]">
              {selected.sourceAnchors.length ? (
                selected.sourceAnchors.map((anchor) => (
                  <li
                    key={`${anchor.sourceVersionId}:${anchor.locator}:${anchor.anchorHash}`}
                    className="break-all rounded border border-[var(--av-color-border)] bg-[var(--av-color-surface)] p-2"
                  >
                    <strong>
                      {anchor.sourceLabel}
                      {anchor.sourceVersion === null
                        ? ""
                        : ` · v${anchor.sourceVersion}`}
                    </strong>
                    <span className="mt-1 block">{anchor.locator}</span>
                    <details className="mt-2">
                      <summary className="cursor-pointer font-semibold">
                        Audit details
                      </summary>
                      <span className="mt-1 block">
                        Source version {anchor.sourceVersionId}
                      </span>
                      <span className="mt-1 block">
                        Anchor hash {anchor.anchorHash}
                      </span>
                    </details>
                  </li>
                ))
              ) : (
                <li>
                  No source citation. This section is explicitly{" "}
                  {selected.labels
                    .map((label) => label.replace("_", " "))
                    .join(", ")}
                  .
                </li>
              )}
            </ul>
            {selected.labels.length > 0 && (
              <p className="mt-3 text-xs font-semibold text-[var(--av-color-text-muted)]">
                Labels:{" "}
                {selected.labels
                  .map((label) => label.replace("_", " "))
                  .join(", ")}
              </p>
            )}
            <details className="mt-3 text-xs text-[var(--av-color-text-subtle)]">
              <summary className="cursor-pointer font-semibold">
                Audit details
              </summary>
              <p className="mt-2">
                Saved history retains exact source version, locator and anchor
                hash references.
              </p>
            </details>
            <div className="mt-5 border-t border-[var(--av-color-border)] pt-4">
              <p className="av-eyebrow">Preview</p>
              <h5 className="mt-2 break-words text-lg font-bold text-[var(--av-color-text)]">
                {selected.title}
              </h5>
              {selected.id === "asIsFlow" || selected.id === "toBeFlow" ? (
                <MermaidRenderer
                  code={selected.body}
                  id={`studio-${selected.id}`}
                />
              ) : (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--av-color-text-muted)]">
                  {selected.body}
                </p>
              )}
            </div>
          </aside>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={readOnly || saving || !dirty}
          onClick={commit}
          className="btn-primary min-h-10 px-4 text-sm font-bold disabled:opacity-50"
        >
          Save changes
        </button>
      </div>
    </section>
  );
}
