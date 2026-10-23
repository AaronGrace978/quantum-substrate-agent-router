/**
 * Industrial-Dark Terminal Formatter (ANSI / Box-Drawing HUD)
 * Renders silicon telemetry frames, entropy gauges, and agent responses
 * in a high-contrast bare-metal console layout.
 */

export interface TelemetryFrame {
  seq: number;
  ts_ms: number;
  cells: number;
  raw_bytes: number;
  variance: number;
  shannon_bits?: number;
  thermal_jitter_ns?: number;
  bit_flips: number;
  popcount_skew?: number;
  sample_hex?: string;
}

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  slate: "\x1b[38;5;240m",
  steel: "\x1b[38;5;246m",
  cyan: "\x1b[38;5;45m",
  amber: "\x1b[38;5;214m",
  emerald: "\x1b[38;5;48m",
  crimson: "\x1b[38;5;197m",
  violet: "\x1b[38;5;141m",
  bgDark: "\x1b[48;5;234m",
};

export function printBanner(frameCount: number, liveApi: boolean): void {
  const modeTag = liveApi
    ? `${C.emerald}LIVE :: GEMINI-2.5-FLASH${C.reset}`
    : `${C.amber}SIMULATED DRY-RUN :: DETERMINISTIC SYNTH${C.reset}`;

  console.log("");
  console.log(
    `${C.slate}╔══════════════════════════════════════════════════════════════════════════════╗${C.reset}`
  );
  console.log(
    `${C.slate}║${C.reset} ${C.bold}${C.cyan}QUANTUM SUBSTRATE AGENT ROUTER${C.reset} ${C.slate}//${C.reset} ${C.steel}BARE-METAL ENTROPY TELEMETRY ENGINE${C.reset}        ${C.slate}║${C.reset}`
  );
  console.log(
    `${C.slate}╠══════════════════════════════════════════════════════════════════════════════╣${C.reset}`
  );
  console.log(
    `${C.slate}║${C.reset} ${C.dim}HARVESTER:${C.reset} ${C.steel}std::ptr::read_volatile (Rust)  ${C.dim}│${C.reset} ${C.dim}FRAMES:${C.reset} ${C.cyan}${String(frameCount).padEnd(4)}${C.reset} ${C.dim}│${C.reset} ${C.dim}TEMP:${C.reset} ${C.amber}[0.10..2.00]${C.reset}  ${C.slate}║${C.reset}`
  );
  console.log(
    `${C.slate}║${C.reset} ${C.dim}RUNTIME  :${C.reset} ${modeTag.padEnd(76)}${C.slate}║${C.reset}`
  );
  console.log(
    `${C.slate}╚══════════════════════════════════════════════════════════════════════════════╝${C.reset}`
  );
}

export function renderGauge(norm: number, width = 22): string {
  const filled = Math.max(1, Math.min(width, Math.round(norm * width)));
  const empty = width - filled;
  const color = norm < 0.35 ? C.cyan : norm < 0.72 ? C.amber : C.crimson;
  return `${color}${"█".repeat(filled)}${C.slate}${"░".repeat(empty)}${C.reset}`;
}

export function regimeLabel(temp: number): string {
  if (temp < 0.55) return `${C.cyan}CRYOGENIC-LOCK${C.reset}`;
  if (temp < 1.15) return `${C.emerald}THERMAL-EQUILIBRIUM${C.reset}`;
  if (temp < 1.6) return `${C.amber}STOCHASTIC-DRIFT${C.reset}`;
  return `${C.crimson}QUANTUM-TUNNEL-SURGE${C.reset}`;
}

export function printFrameCard(
  f: TelemetryFrame,
  temperature: number,
  norm: number,
  agentReply: string
): void {
  const shannon = (f.shannon_bits ?? 4.8).toFixed(3);
  const jitterUs = ((f.thermal_jitter_ns ?? 12000) / 1000).toFixed(1);
  const hex = f.sample_hex ?? "A73F09C2E1B4085D";
  const gauge = renderGauge(norm, 20);
  const regime = regimeLabel(temperature);

  console.log(
    `${C.slate}┌─[ FRAME #${String(f.seq).padStart(2, "0")} ]──[ TS ${f.ts_ms} ]──[ CELLS ${f.cells} :: ${f.raw_bytes} B ]───────────────────┐${C.reset}`
  );
  console.log(
    `${C.slate}│${C.reset} ${C.dim}VARIANCE :${C.reset} ${C.cyan}${f.variance.toFixed(3).padStart(9)}${C.reset}   ${C.dim}SHANNON H:${C.reset} ${C.violet}${shannon} b/B${C.reset}   ${C.dim}BIT-FLIPS:${C.reset} ${C.amber}${String(f.bit_flips).padStart(7)}${C.reset} ${C.slate}│${C.reset}`
  );
  console.log(
    `${C.slate}│${C.reset} ${C.dim}JITTER   :${C.reset} ${C.steel}${jitterUs.padStart(7)} µs${C.reset}   ${C.dim}SILICON  :${C.reset} ${C.emerald}0x${hex}${C.reset}                         ${C.slate}│${C.reset}`
  );
  console.log(
    `${C.slate}│${C.reset} ${C.dim}TEMP MAP :${C.reset} ${C.bold}${C.amber}T = ${temperature.toFixed(3)}${C.reset}  [${gauge}]  ${regime}`
  );
  console.log(
    `${C.slate}├──────────────────────────────────────────────────────────────────────────────┤${C.reset}`
  );
  console.log(
    `${C.slate}│${C.reset} ${C.cyan}AGENT ▸${C.reset} ${C.steel}${agentReply}${C.reset}`
  );
  console.log(
    `${C.slate}└──────────────────────────────────────────────────────────────────────────────┘${C.reset}`
  );
}

export function printSummary(temps: number[]): void {
  const avg = temps.reduce((a, b) => a + b, 0) / (temps.length || 1);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  console.log(
    `${C.slate}══[ SUBSTRATE CYCLE COMPLETE :: FRAMES=${temps.length} │ T_MIN=${min.toFixed(3)} │ T_AVG=${avg.toFixed(3)} │ T_MAX=${max.toFixed(3)} ]══${C.reset}\n`
  );
}
