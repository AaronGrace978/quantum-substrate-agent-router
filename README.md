# Quantum Substrate Agent Router (`ripple-architect`)

A bare-metal hardware-software integration engine that harvests raw silicon entropy (volatile heap reads + sub-nanosecond cache-line thermal timing jitter) in Rust and pipes real-time structural variance telemetry into a TypeScript autonomous agent router (`gemini-2.5-flash` via `@google/genai`).

## Architecture

1. **Rust Silicon Harvester (`src/main.rs` / `Cargo.toml`)**  
   Allocates 64-byte aligned heap cells via `std::alloc::Layout`, sweeps them with `std::ptr::read_volatile`, and folds sub-nanosecond cache-line timing jitter into structural variance, Shannon entropy, bit-flip counts, and popcount skew. Emits newline-delimited JSON telemetry frames (or an industrial ANSI HUD with `--pretty`).
2. **TypeScript Agent Router (`src/agent_router.ts`)**  
   Spawns the Rust harvester binary, maps each frame's structural variance into a bounded LLM exploration temperature in `[0.1, 2.0]`, and dispatches live generation calls to `gemini-2.5-flash` (with deterministic offline synthesis when `GEMINI_API_KEY` is unset).
3. **Terminal HUD & Interactive Visualizer (`src/terminal_ui.ts`, `index.html`)**  
   Renders ANSI telemetry cards in the terminal and provides an interactive browser-based Quantum Substrate telemetry dashboard.

## Quick Start

```bash
# Build the Rust silicon harvester
cargo build --release

# Install Node dependencies and run the agent router
npm install
npm start
```

Optional live Gemini routing:
```bash
export GEMINI_API_KEY="your-api-key"
npx tsx src/agent_router.ts --frames 4
```
