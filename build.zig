const std = @import("std");

pub fn build(b: *std.Build) void {
    const wasm = b.addExecutable(.{
        .name = "tone",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/tone.zig"),
            .target = b.resolveTargetQuery(.{ .cpu_arch = .wasm32, .os_tag = .freestanding }),
            .optimize = .ReleaseSafe,
            .strip = true,
        }),
    });
    wasm.entry = .disabled;
    wasm.rdynamic = true;
    b.installArtifact(wasm);
}
