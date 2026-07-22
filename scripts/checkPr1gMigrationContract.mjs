import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20260722120000_pr1g_application_portfolio.sql','utf8');
const required=['capabilities(capability_key,module,description)','ON CONFLICT(capability_key)','ENABLE ROW LEVEL SECURITY','FORCE ROW LEVEL SECURITY','REVOKE ALL ON TABLE','GRANT SELECT ON TABLE','CREATE POLICY','SECURITY DEFINER SET search_path=pg_catalog','pr1g_execute_application_command','GRANT EXECUTE ON FUNCTION public.pr1g_execute_application_command'];
const missing=required.filter(x=>!sql.includes(x));
if(missing.length){console.error(`PR 1G migration contract missing: ${missing.join(', ')}`);process.exit(1)}
for(const table of ['assess_application_assets','assess_application_metadata_versions','assess_process_application_links','assess_application_dependencies','assess_application_assessment_versions','assess_application_dimension_results','assess_application_modernization_recommendations','assess_application_review_resolutions','assess_application_portfolio_snapshots','assess_application_import_receipts','assess_application_import_row_outcomes']){if(!sql.includes(table)){console.error(`Missing table ${table}`);process.exit(1)}}
if(/RAISE EXCEPTION 'PR1G_PRIVATE_RPC_REQUIRES_SERVICE_IMPLEMENTATION'/.test(sql)){console.error('Placeholder RPC remains');process.exit(1)}
console.log('PR 1G migration contract checks passed.');
