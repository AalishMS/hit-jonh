import { buildCrossCheckShots, runCrossCheck } from './crossCheck';

const out = document.getElementById('out')!;
// Let "Running…" paint before the synchronous run.
setTimeout(() => {
  const started = performance.now();
  const report = runCrossCheck(buildCrossCheckShots());
  out.textContent = [
    `Browser: ${navigator.userAgent}`,
    `Shots: ${report.count}`,
    `Outcome digest: ${report.outcomeDigest}`,
    `Exact digest:   ${report.exactDigest}`,
    `Outcomes: ${JSON.stringify(report.counts)}`,
    `Time: ${Math.round(performance.now() - started)} ms`,
    '',
    ...report.lines,
  ].join('\n');
}, 50);
