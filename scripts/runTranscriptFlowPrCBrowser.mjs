import { browserModeByFlag, runBrowserHarness } from './runTranscriptFlowBrowser.mjs';

const mode = browserModeByFlag.get('--delivery-monitor-pr-c');
if (!mode) throw new Error('PR C browser mode is not registered.');

try {
  process.exitCode = await runBrowserHarness({
    mode,
    playwrightArguments: process.argv.slice(2),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
