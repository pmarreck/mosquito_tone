//! Persistent phase and amplitude, no allocation or I/O in the render path.
const std = @import("std");
const capacity: usize = 2048;
var samples: [capacity]f32 = @splat(0);
var phase: f64 = 0;
var amplitude: f64 = 0;
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
    @memset(&samples, 0);
}

/// Returns frames written, or -1 for invalid parameters. Failed calls never
/// mutate phase/amplitude; the caller must not consume old samples on error.
export fn render(hz: f64, rate: f64, frames: u32, enabled: u32) i32 {
    if (!std.math.isFinite(hz) or !std.math.isFinite(rate) or
        rate < 32000 or rate > 192000 or hz < 14000 or hz > 19000 or
        hz >= rate / 2 or frames == 0 or frames > capacity or enabled > 1) return -1;
    const target: f64 = if (enabled == 1) 1 else 0;
    const ramp_step = 1.0 / (rate * 0.02);
    for (samples[0..frames]) |*sample| {
        if (amplitude < target) amplitude = @min(target, amplitude + ramp_step);
        if (amplitude > target) amplitude = @max(target, amplitude - ramp_step);
        sample.* = @floatCast(@sin(phase) * amplitude);
        phase += tau * hz / rate;
        if (phase >= tau) phase -= tau;
    }
    return @intCast(frames);
}
