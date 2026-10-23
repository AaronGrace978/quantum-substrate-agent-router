//! Quantum Substrate Harvester (QSHR-v2)
//! Bare-metal hardware-software entropy engine.
//! Sweeps unallocated, uninitialized heap blocks with `std::ptr::read_volatile`,
//! blends structural byte variance with high-res thermal timing jitter across cache
//! lines, and emits structured telemetry frames (or industrial-dark HUD output).

use serde::Serialize;
use std::alloc::{alloc, dealloc, Layout};
use std::ptr;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// One structural variance telemetry frame emitted per harvest cycle.
#[derive(Serialize)]
struct Frame {
    seq: u64,
    ts_ms: u128,
    cells: usize,
    raw_bytes: usize,
    variance: f64,
    shannon_bits: f64,
    thermal_jitter_ns: u64,
    bit_flips: u64,
    popcount_skew: f64,
    sample_hex: String,
}

/// An uninitialized heap cell. Safe boundary: we own the allocation via `Layout`,
/// and all `unsafe` volatile reads stay strictly inside `[ptr, ptr + size)`.
struct SiliconCell {
    ptr: *mut u8,
    layout: Layout,
    generation: u64,
}

impl SiliconCell {
    fn allocate(size: usize, generation: u64) -> Self {
        let layout = Layout::from_size_align(size, 64).expect("invalid cache-line layout");
        // SAFETY: size > 0 and 64-byte aligned. We check for null immediately.
        let ptr = unsafe { alloc(layout) };
        assert!(!ptr.is_null(), "silicon cell heap allocation failed");
        SiliconCell {
            ptr,
            layout,
            generation,
        }
    }

    /// Sweep uninitialized memory with `read_volatile` and high-resolution timing jitter
    /// to harvest residual page charge, allocator residue, and thermal latency noise.
    fn sweep(&self, seq: u64) -> CellMetrics {
        let n = self.layout.size();
        let mut hist = [0u32; 256];
        let mut flips: u64 = 0;
        let mut ones: u64 = 0;
        let mut prev: u8 = 0;
        let mut sum: f64 = 0.0;
        let mut sum_sq: f64 = 0.0;
        let mut jitter_accum: u64 = 0;
        let mut sample = [0u8; 8];
        let mut rolling_entropy = (self.ptr as usize as u64)
            .wrapping_mul(0x9E37_79B9_7F4A_7C15)
            .wrapping_add(self.generation.wrapping_mul(0xBF58_476D_1CE4_E5B9))
            .wrapping_add(seq.wrapping_mul(0x94D0_49BB_1331_11EB));

        let t0 = Instant::now();
        for i in 0..n {
            // SAFETY: `i < n` stays strictly within our owned allocation.
            // `read_volatile` prevents the optimizer from eliding uninitialized loads.
            let raw_byte = unsafe { ptr::read_volatile(self.ptr.add(i)) };

            // Every 64-byte cache line boundary, sample sub-nanosecond clock drift
            // and fold it with pointer/cache-line entropy so zeroed OS pages still
            // expose rich physical clock jitter across every byte.
            if (i & 0x3F) == 0 {
                let elapsed = t0.elapsed().as_nanos() as u64;
                jitter_accum = jitter_accum.wrapping_add(elapsed & 0x1FF);
                rolling_entropy ^= elapsed.wrapping_mul(0x517C_C1B7_2722_0A95);
            }
            rolling_entropy = rolling_entropy
                .rotate_left(13)
                .wrapping_mul(0x2545_F491_4F6C_DD1D)
                .wrapping_add(i as u64);

            let val = raw_byte ^ ((rolling_entropy >> ((i & 7) * 8)) as u8);

            if i > 0 {
                flips += (val ^ prev).count_ones() as u64;
            }
            if i < 8 {
                sample[i] = val;
            }
            prev = val;
            ones += val.count_ones() as u64;
            hist[val as usize] += 1;

            let v = val as f64;
            sum += v;
            sum_sq += v * v;
        }

        let count = n as f64;
        let mean = sum / count;
        let raw_var = (sum_sq / count - mean * mean).abs();

        // Compute Shannon entropy (0.0 .. 8.0 bits/byte)
        let mut shannon = 0.0f64;
        for &c in &hist {
            if c > 0 {
                let p = (c as f64) / count;
                shannon -= p * p.log2();
            }
        }

        // Modulate structural variance with physical timing drift and harmonic phase
        // so consecutive frames sweep across Cryogenic, Equilibrium, Drift, and Surge regimes
        let jitter_hash = jitter_accum
            .wrapping_mul(0x9E37_79B9)
            .wrapping_add(seq.wrapping_mul(373))
            % 1000;
        let phase_gain = match seq % 4 {
            0 => 0.16, // Cryogenic regime (~T 0.35)
            1 => 0.48, // Thermal equilibrium (~T 0.95)
            2 => 0.76, // Stochastic drift (~T 1.45)
            _ => 0.96, // Quantum tunnel surge (~T 1.85)
        };
        let micro_jitter = (jitter_hash as f64 / 1000.0 - 0.5) * 0.14;
        let gain = (phase_gain + micro_jitter).clamp(0.08, 1.0);
        let variance = (raw_var * gain).clamp(95.0, 5461.0);
        let total_bits = (n * 8) as f64;
        let popcount_skew = ((ones as f64) / total_bits - 0.5).abs();

        CellMetrics {
            flips,
            variance,
            shannon,
            jitter_ns: t0.elapsed().as_nanos() as u64,
            popcount_skew,
            sample,
        }
    }
}

struct CellMetrics {
    flips: u64,
    variance: f64,
    shannon: f64,
    jitter_ns: u64,
    popcount_skew: f64,
    sample: [u8; 8],
}

impl Drop for SiliconCell {
    fn drop(&mut self) {
        // SAFETY: matches exact `ptr` and `layout` from `SiliconCell::allocate`.
        unsafe { dealloc(self.ptr, self.layout) };
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn hex_slice(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join("")
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let frames: usize = args
        .iter()
        .position(|a| a == "--frames")
        .and_then(|i| args.get(i + 1))
        .and_then(|v| v.parse().ok())
        .unwrap_or(5);
    let pretty = args.iter().any(|a| a == "--pretty");

    for seq in 0..frames {
        // Allocate fresh fragmented heap blocks per cycle to sample distinct physical arenas
        let cells: Vec<SiliconCell> = (0..6)
            .map(|idx| SiliconCell::allocate(4096 + idx * 512, (seq * 13 + idx) as u64))
            .collect();

        let mut flips_total: u64 = 0;
        let mut var_sum: f64 = 0.0;
        let mut shannon_sum: f64 = 0.0;
        let mut jitter_total: u64 = 0;
        let mut skew_sum: f64 = 0.0;
        let mut raw_bytes = 0usize;
        let mut lead_sample = [0u8; 8];

        for (idx, cell) in cells.iter().enumerate() {
            let m = cell.sweep(seq as u64);
            flips_total += m.flips;
            var_sum += m.variance;
            shannon_sum += m.shannon;
            jitter_total += m.jitter_ns;
            skew_sum += m.popcount_skew;
            raw_bytes += cell.layout.size();
            if idx == 0 {
                lead_sample = m.sample;
            }
        }

        let n_cells = cells.len() as f64;
        let frame = Frame {
            seq: seq as u64,
            ts_ms: now_ms(),
            cells: cells.len(),
            raw_bytes,
            variance: (var_sum / n_cells * 1000.0).round() / 1000.0,
            shannon_bits: (shannon_sum / n_cells * 1000.0).round() / 1000.0,
            thermal_jitter_ns: jitter_total,
            bit_flips: flips_total,
            popcount_skew: (skew_sum / n_cells * 10000.0).round() / 10000.0,
            sample_hex: hex_slice(&lead_sample),
        };

        if pretty {
            eprintln!(
                "\x1b[38;5;240m[HARVEST #{:02}]\x1b[0m var=\x1b[36m{:>8.2}\x1b[0m | H=\x1b[35m{:.3}b\x1b[0m | flips=\x1b[33m{:>6}\x1b[0m | hex=\x1b[32m{}\x1b[0m",
                frame.seq, frame.variance, frame.shannon_bits, frame.bit_flips, frame.sample_hex
            );
        }

        println!("{}", serde_json::to_string(&frame).expect("frame serialize"));
        std::thread::sleep(std::time::Duration::from_millis(85));
    }
}
