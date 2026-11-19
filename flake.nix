{
  description = "Installable high-frequency tone generator with a WebAssembly oscillator";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/9fbb54b33e91ee4ca368e35a78e0613c720600b3";
  outputs = { self, nixpkgs }: let
    systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
    each = nixpkgs.lib.genAttrs systems;
    forSystem = system: let
      pkgs = import nixpkgs { inherit system; };
      src = pkgs.lib.fileset.toSource {
        root = ./.;
        fileset = pkgs.lib.fileset.unions [ ./src ./web ./scripts ./tests ./build.zig ./VERSION ];
      };
      site = pkgs.stdenvNoCC.mkDerivation {
        pname = "mosquito-tone";
        version = pkgs.lib.fileContents ./VERSION;
        inherit src;
        nativeBuildInputs = [ pkgs.zig_0_16 pkgs.nodejs ];
        strictDeps = true;
        dontConfigure = true;
        buildPhase = ''
          export HOME="$TMPDIR"
          export ZIG_GLOBAL_CACHE_DIR="$TMPDIR/zig-global"
          export ZIG_LOCAL_CACHE_DIR="$TMPDIR/zig-local"
          zig build --prefix compiled
          node scripts/package.mjs compiled/bin/tone.wasm dist
        '';
        installPhase = ''mkdir -p "$out"; cp -R dist/. "$out/"'';
      };
      fixtureSources = builtins.fromJSON (builtins.readFile ./tests/fixtures.json);
      fixtures = pkgs.runCommand "mosquito-tone-reference-pcm" {
        nativeBuildInputs = [ pkgs.ffmpeg-headless ];
      } (''
        mkdir -p "$out"
      '' + pkgs.lib.concatStringsSep "\n" (pkgs.lib.mapAttrsToList (name: source: ''
        ffmpeg -v error -i ${pkgs.fetchurl source} -f f32le -ac 1 -ar 44100 "$out/${name}.f32"
      '') fixtureSources));
      tests = pkgs.runCommand "mosquito-tone-tests" {
        inherit src;
        nativeBuildInputs = [ pkgs.nodejs ] ++ pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.chromium ];
        TONE_SITE = "${site}";
        TONE_FIXTURES = "${fixtures}";
        TONE_CHROMIUM = if pkgs.stdenv.isLinux then "${pkgs.chromium}/bin/chromium" else "";
        FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
      } ''
        export HOME="$TMPDIR/home"
        export TONE_SCREENSHOT="$TMPDIR/phone.png"
        mkdir -p "$HOME"
        cp -R "$src" source
        chmod -R u+w source
        cd source
        node tests/all.mjs
        mkdir -p "$out"
        ${pkgs.lib.optionalString pkgs.stdenv.isLinux ''cp "$TONE_SCREENSHOT" "$out/phone.png"''}
        printf 'passed\n' > "$out/result"
      '';
      server = pkgs.writeShellApplication {
        name = "mosquito-tone";
        runtimeInputs = [ pkgs.nodejs ];
        text = ''exec node ${./scripts/serve.mjs} ${site} "$@"'';
      };
    in { inherit site tests server; };
  in {
    packages = each (system: { default = (forSystem system).site; });
    checks = each (system: {
      package = (forSystem system).site;
      test = (forSystem system).tests;
    });
    apps = each (system: { default = { type = "app"; program = "${(forSystem system).server}/bin/mosquito-tone"; }; });
  };
}
