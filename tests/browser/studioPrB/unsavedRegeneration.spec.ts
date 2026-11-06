import { expect, test } from "@playwright/test";

test("selected update requires explicit discard before unsaved sections can be replaced", async ({
  page,
}) => {
  await page.goto(
    "/tests/browser/studioPrB/harness.html?mode=direct&sddFlows=1&state=source-binding-changed",
    { waitUntil: "domcontentloaded" },
  );
  const workspace = page.getByTestId("studio-artifact-workspace");
  await expect(workspace).toBeVisible();
  await workspace.getByLabel("Artifact type").selectOption("sdd");
  const editor = page.getByRole("region", { name: "Current document" });
  await editor.getByRole("checkbox", { name: "Summary" }).check();
  await editor.getByRole("checkbox", { name: "Summary" }).uncheck();
  await editor
    .getByLabel("Section body")
    .fill("Unsaved summary that must not disappear silently.");
  await editor.getByRole("checkbox", { name: "As-Is flow" }).check();
  const generationCount = () =>
    page.evaluate(
      () =>
        ((window as any).__studioCommandCalls ?? []).filter(
          (call: any) => call.commandType === "studio.generation.request",
        ).length,
    );
  const before = await generationCount();
  await editor
    .getByRole("button", { name: "Update selected sections" })
    .click();
  const dialog = editor.getByRole("dialog", {
    name: "Save or discard your changes",
  });
  await expect(dialog).toBeVisible();
  const closeDialog = dialog.getByRole("button", {
    name: "Close Save or discard your changes",
  });
  await expect(closeDialog).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeDialog).toBeFocused();
  await expect(editor.getByLabel("Section body")).toHaveValue(
    "Unsaved summary that must not disappear silently.",
  );
  expect(await generationCount()).toBe(before);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    editor.getByRole("button", { name: "Update selected sections" }),
  ).toBeFocused();
  await expect(editor.getByLabel("Section body")).toHaveValue(
    "Unsaved summary that must not disappear silently.",
  );
  await editor
    .getByRole("button", { name: "Update selected sections" })
    .click();
  await editor
    .getByRole("dialog", { name: "Save or discard your changes" })
    .getByRole("button", { name: "Discard changes and update" })
    .click();
  await expect(
    page.getByText(/Selected sections were regenerated/u),
  ).toBeVisible();
  expect(await generationCount()).toBe(before + 1);
  await editor.getByRole("button", { name: "1. Summary", exact: true }).click();
  await expect(editor.getByLabel("Section body")).toHaveValue(
    "Synthetic provider-free working draft.",
  );
});

test("saving dirty sections completes before selected regeneration and preserves unselected text", async ({
  page,
}) => {
  await page.goto(
    "/tests/browser/studioPrB/harness.html?mode=direct&sddFlows=1&state=source-binding-changed",
    { waitUntil: "domcontentloaded" },
  );
  const workspace = page.getByTestId("studio-artifact-workspace");
  await workspace.getByLabel("Artifact type").selectOption("sdd");
  const editor = page.getByRole("region", { name: "Current document" });
  await editor
    .getByLabel("Section body")
    .fill("Saved authored summary retained across selected refresh.");
  await editor.getByLabel("Document title").fill("Supplier invoice solution design");
  await editor.getByRole("checkbox", { name: "As-Is flow" }).check();
  const generationCount = () =>
    page.evaluate(
      () =>
        ((window as any).__studioCommandCalls ?? []).filter(
          (call: any) => call.commandType === "studio.generation.request",
        ).length,
    );
  const before = await generationCount();
  await editor
    .getByRole("button", { name: "Update selected sections" })
    .click();
  await page
    .getByRole("dialog", { name: "Save or discard your changes" })
    .getByRole("button", { name: "Save changes" })
    .click();
  await expect.poll(generationCount).toBe(before + 1);
  await expect(page.getByText(/Selected sections were regenerated/u)).toBeVisible();
  const commandTypes = await page.evaluate(() =>
    ((window as any).__studioCommandCalls ?? [])
      .slice(-2)
      .map((call: any) => call.commandType),
  );
  expect(commandTypes).toEqual([
    "studio.artifact.draft.revise",
    "studio.generation.request",
  ]);
  await editor.getByRole("button", { name: "1. Summary", exact: true }).click();
  await expect(editor.getByLabel("Section body")).toHaveValue(
    "Saved authored summary retained across selected refresh.",
  );
  await expect(editor.getByLabel("Document title")).toHaveValue("Supplier invoice solution design");
  await page.reload({ waitUntil: "domcontentloaded" });
  await workspace.getByLabel("Artifact type").selectOption("sdd");
  const reloaded = page.getByRole("region", { name: "Current document" });
  await reloaded.getByRole("button", { name: "1. Summary", exact: true }).click();
  await expect(reloaded.getByLabel("Section body")).toHaveValue(
    "Saved authored summary retained across selected refresh.",
  );
  await expect(reloaded.getByLabel("Document title")).toHaveValue("Supplier invoice solution design");
});
