//! Persistent phase and amplitude, no allocation or I/O in the render path.
const std = @import("std");
const capacity: usize = 2048;
var samples: [capacity]f32 = @splat(0);
var phase: f64 = 0;
var amplitude: f64 = 0;
// The sweep starts at the selected frequency, rising, then spans -400/+2600 Hz.
const initial_mod_phase = -std.math.asin(@as(f64, 1100.0 / 1500.0));
var mod_phase: f64 = initial_mod_phase;
var was_enabled: bool = false;
var was_warbling: bool = false;
const tau = 2 * std.math.pi;

export fn samples_ptr() [*]f32 {
    return &samples;
}

export fn samples_capacity() u32 {
    return capacity;
}

export fn reset() void {
    phase = 0;
    amplitude = 0;
    mod_phase = initial_mod_phase;
    was_enabled = false;
    was_warbling = false;
    @memset(&samples, 0);
}

/// Returns frames written, or -1 for invalid parameters. Failed calls never
/// mutate phase/amplitude; the caller must not consume old samples on error.
export fn render(hz: f64, rate: f64, frames: u32, enabled: u32, warble: u32) i32 {
    if (!std.math.isFinite(hz) or !std.math.isFinite(rate) or
        rate < 32000 or rate > 192000 or hz < 500 or hz > 19000 or
        hz + @as(f64, if (warble == 1) 2600 else 0) >= rate / 2 or
        frames == 0 or frames > capacity or enabled > 1 or warble > 1) return -1;
    if ((enabled == 1 and !was_enabled) or (warble == 1 and !was_warbling)) mod_phase = initial_mod_phase;
    was_enabled = enabled == 1;
    was_warbling = warble == 1;
    const target: f64 = if (enabled == 1) 1 else 0;
    const ramp_step = 1.0 / (rate * 0.02);
    for (samples[0..frames]) |*sample| {
        if (amplitude < target) amplitude = @min(target, amplitude + ramp_step);
        if (amplitude > target) amplitude = @max(target, amplitude - ramp_step);
        sample.* = @floatCast(@sin(phase) * amplitude);
        const frequency = if (warble == 1) hz + 1100 + 1500 * @sin(mod_phase) else hz;
        phase += tau * frequency / rate;
        if (phase >= tau) phase -= tau;
        if (warble == 1) {
            mod_phase += tau * 3 / rate;
            if (mod_phase >= tau) mod_phase -= tau;
        }
    }
    return @intCast(frames);
}
