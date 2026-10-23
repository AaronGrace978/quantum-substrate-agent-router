/**
 * Quantum Substrate Agent Router (src/agent_router.ts)
 * Spawns or streams from the Rust `quantum-substrate-harvester` binary,
 * maps physical silicon structural variance into a bounded LLM exploration
 * hyperparameter (temperature in [0.1, 2.0]), and dispatches real-time
 * generation payloads into `gemini-2.5-flash` via `@google/genai`.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import {
  type TelemetryFrame,
  printBanner,
  printFrameCard,
  printSummary,
} from "./terminal_ui.js";

export const MIN_TEMP = 0.1;
export const MAX_TEMP = 2.0;
const MAX_EXPECTED_VARIANCE = 5461.0; // Uniform [0..255] byte variance ceiling

/**
 * Maps a raw structural variance telemetry score into a bounded LLM
 * exploration temperature within [0.1, 2.0].
 */
export function mapVarianceToTemperature(variance: number): {
  temperature: number;
  normalized: number;
} {
  const safeVar = Number.isFinite(variance) ? Math.max(0, variance) : 0;
  const normalized = Math.min(1, Math.max(0, safeVar / MAX_EXPECTED_VARIANCE));
  const rawTemp = MIN_TEMP + normalized * (MAX_TEMP - MIN_TEMP);
  const clamped = Math.min(MAX_TEMP, Math.max(MIN_TEMP, rawTemp));
  return {
    temperature: Math.round(clamped * 1000) / 1000,
    normalized,
  };
}

/**
 * Resolves the compiled Rust harvester binary if already built, or falls
 * back to `cargo run --release --quiet`.
 */
function resolveHarvesterCommand(frameCount: number): {
  cmd: string;
  args: string[];
} {
  const ext = process.platform === "win32" ? ".exe" : "";
  const releaseBin = join(
    process.cwd(),
    "target",
    "release",
    `quantum-substrate-harvester${ext}`
  );
  const debugBin = join(
    process.cwd(),
    "target",
    "debug",
    `quantum-substrate-harvester${ext}`
  );

  if (existsSync(releaseBin)) {
    return { cmd: releaseBin, args: ["--frames", String(frameCount)] };
  }
  if (existsSync(debugBin)) {
    return { cmd: debugBin, args: ["--frames", String(frameCount)] };
  }
  return {
    cmd: "cargo",
    args: ["run", "--quiet", "--", "--frames", String(frameCount)],
  };
}

/**
 * Spawns the Rust silicon harvester and parses newline-delimited JSON
 * telemetry frames from stdout.
 */
export async function harvestSiliconFrames(
  frameCount: number
): Promise<TelemetryFrame[]> {
  const { cmd, args } = resolveHarvesterCommand(frameCount);

  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: process.cwd() });
    let buffer = "";
    const frames: TelemetryFrame[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let nlIndex: number;
      while ((nlIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nlIndex).trim();
        buffer = buffer.slice(nlIndex + 1);
        if (!line.startsWith("{")) continue;
        try {
          frames.push(JSON.parse(line) as TelemetryFrame);
        } catch {
          // Ignore non-frame diagnostic lines
        }
      }
    });

    child.stderr.on("data", () => {
      // Suppress cargo compilation progress in clean HUD mode
    });

    child.on("close", () => resolve(frames));
    child.on("error", reject);
  });
}

/**
 * Deterministic fallback synthesis when GEMINI_API_KEY is not present in
 * the environment, preserving full verification in headless/offline runs.
 */
function synthesizeOfflineDirective(
  frame: TelemetryFrame,
  temperature: number
): string {
  if (temperature < 0.55) {
    return `[DRY-SYNTH T=${temperature.toFixed(2)}] Constrain token search to high-certainty deterministic proofs (flips=${frame.bit_flips}).`;
  }
  if (temperature < 1.15) {
    return `[DRY-SYNTH T=${temperature.toFixed(2)}] Balance analytical deduction with lateral hypothesis branching (var=${frame.variance.toFixed(1)}).`;
  }
  if (temperature < 1.6) {
    return `[DRY-SYNTH T=${temperature.toFixed(2)}] Amplify stochastic beam divergence across non-linear architectural manifolds.`;
  }
  return `[DRY-SYNTH T=${temperature.toFixed(2)}] Maximum quantum tunneling exploration: sample high-entropy creative mutations.`;
}

async function runAgentRouter(): Promise<void> {
  const idx = process.argv.indexOf("--frames");
  const frameCount = idx >= 0 ? Math.max(1, Number(process.argv[idx + 1]) || 4) : 4;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

  printBanner(frameCount, Boolean(ai));

  const frames = await harvestSiliconFrames(frameCount);
  if (frames.length === 0) {
    console.error("FATAL: No silicon telemetry frames received from Rust harvester.");
    process.exit(1);
  }

  const temperatures: number[] = [];

  for (const frame of frames) {
    const { temperature, normalized } = mapVarianceToTemperature(frame.variance);
    temperatures.push(temperature);

    let agentOutput: string;
    if (ai) {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents:
          `Hardware silicon entropy frame #${frame.seq}: structural variance=${frame.variance.toFixed(2)}, ` +
          `bit_flips=${frame.bit_flips}, mapped exploration temperature=${temperature}. ` +
          `Respond with one concise, industrial-grade directive describing how an autonomous systems agent should adapt its reasoning at this temperature.`,
        config: {
          temperature,
        },
      });
      agentOutput = (response.text ?? "(empty response)").replace(/\s+/g, " ").trim();
    } else {
      agentOutput = synthesizeOfflineDirective(frame, temperature);
    }

    printFrameCard(frame, temperature, normalized, agentOutput);
  }

  printSummary(temperatures);
}

runAgentRouter().catch((err) => {
  console.error("ROUTER EXCEPTION:", err);
  process.exit(1);
});
