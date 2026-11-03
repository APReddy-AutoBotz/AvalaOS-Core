import assert from "node:assert/strict";
import pg from "pg";
import { runStudioPrivateArtifactCrossLayerEvidence } from "./studioPrivateArtifactCrossLayerPostgres.mjs";
const crossLayerScenarioNames = [
  "cross-layer RPC signature parity",
  "cross-layer real rendition claim and production saga",
  "cross-layer renderer template schema version parity",
  "cross-layer real download claim exact replay",
  "cross-layer real deletion claim and tombstone",
  "cross-layer external-effect replay counts",
];

const databaseUrl = process.env.STUDIO_PRIVATE_ARTIFACT_MIGRATION_DATABASE_URL;
if (!databaseUrl)
  throw new Error("STUDIO_PRIVATE_ARTIFACT_MIGRATION_DATABASE_URL is required");
if (process.env.STUDIO_PRIVATE_ARTIFACT_DISPOSABLE_DATABASE !== "true")
  throw new Error("STUDIO_PRIVATE_ARTIFACT_DISPOSABLE_DATABASE=true is required");
const target = new URL(databaseUrl);
if (
  !["postgres:", "postgresql:"].includes(target.protocol) ||
  !["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname.toLowerCase())
)
  throw new Error("SDD cross-layer evidence requires a disposable loopback PostgreSQL URL");

const database = new pg.Client({ connectionString: databaseUrl });
const passed = [];
const scenario = async (name, assertion) => {
  await assertion();
  passed.push(name);
  console.log(`PASS ${name}`);
};

await database.connect();
try {
  await database.query("BEGIN");
  const template = (
    await database.query(
      "SELECT template_version,content_schema_version FROM public.studio_system_template_versions WHERE artifact_type='sdd' AND superseded_at IS NULL",
    )
  ).rows;
  assert.deepEqual(template, [
    {
      template_version: "studio-sdd-1",
      content_schema_version: "studio-artifact-2",
    },
  ]);
  const counts = await runStudioPrivateArtifactCrossLayerEvidence(database, {
    scenario,
    names: crossLayerScenarioNames,
    contractParityPassed: true,
    artifactType: "sdd",
    format: "pdf",
    brokerFixturePath: "tests/fixtures/process-evidence/synthetic-sdd-export.pdf",
  });
  assert.equal(passed.length, crossLayerScenarioNames.length);
  console.log(
    `SDD PDF CROSS-LAYER PASS ${JSON.stringify({ scenarios: passed.length, ...counts })}`,
  );
} finally {
  await database.query("ROLLBACK").catch(() => undefined);
  await database.end();
}
