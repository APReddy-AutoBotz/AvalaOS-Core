import { spawn } from 'node:child_process';

export const PR_C_COMMAND_OUTPUT_LIMIT_BYTES = 128 * 1024 * 1024;

const invocationFor = ({ command, platform, comSpec }) => {
  const [executable, ...args] = command.split(' ');
  if (platform === 'win32' && (executable === 'npm' || executable === 'npm.cmd')) {
    return {
      executable: comSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', ['npm.cmd', ...args].join(' ')],
    };
  }
  return { executable, args };
};

export const runPrCEvidenceCommand = ({
  command,
  commandId,
  cwd,
  environment = process.env,
  platform = process.platform,
  comSpec = process.env.ComSpec,
  spawnImpl = spawn,
  stdoutSink = process.stdout,
  stderrSink = process.stderr,
  maxOutputBytes = PR_C_COMMAND_OUTPUT_LIMIT_BYTES,
}) => new Promise(resolve => {
  const invocation = invocationFor({ command, platform, comSpec });
  const output = { stdout: [], stderr: [] };
  const bytes = { stdout: 0, stderr: 0 };
  let executionError = null;
  let settled = false;
  let child;

  const finish = (code, signal) => {
    if (settled) return;
    settled = true;
    resolve({
      status: Number.isInteger(code) && !executionError ? code : 1,
      signal: signal || null,
      stdout: output.stdout.join(''),
      stderr: output.stderr.join(''),
      error: executionError,
    });
  };

  try {
    child = spawnImpl(invocation.executable, invocation.args, {
      cwd,
      env: { ...environment, PR_C_EVIDENCE_COMMAND_ID: commandId },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (error) {
    executionError = error;
    finish(1, null);
    return;
  }

  const capture = (streamName, sink, chunk) => {
    if (executionError) return;
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    bytes[streamName] += Buffer.byteLength(text, 'utf8');
    if (bytes[streamName] > maxOutputBytes) {
      executionError = Object.assign(new Error(`PR_C_COMMAND_OUTPUT_LIMIT:${commandId}:${streamName}`), {
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
      });
      child.kill();
      return;
    }
    output[streamName].push(text);
    sink.write(text);
  };

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', chunk => capture('stdout', stdoutSink, chunk));
  child.stderr?.on('data', chunk => capture('stderr', stderrSink, chunk));
  child.once('error', error => { executionError = error; });
  child.once('close', finish);
});
