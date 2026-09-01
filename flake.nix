{
  description = "ACRYL local-first plugin-native agent workspace";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    # x86_64-darwin was dropped from nixpkgs-unstable after 26.05.
    # Pin the 26.05-darwin stable branch for Intel macOS.
    nixpkgs-darwin-legacy.url = "github:NixOS/nixpkgs/nixpkgs-26.05-darwin";
    systems.url = "github:nix-systems/default";
  };

  outputs = { self, nixpkgs, nixpkgs-darwin-legacy, systems, ... }:
    let
      allSystems = import systems;

      # Use the legacy pin for x86_64-darwin, unstable for everything else.
      nixpkgsFor = system:
        if system == "x86_64-darwin"
        then nixpkgs-darwin-legacy
        else nixpkgs;

      forAllSystems = f: nixpkgs.lib.genAttrs allSystems (system: f {
        inherit system;
        pkgs = (nixpkgsFor system).legacyPackages.${system};
      });

      # Filter out the deepseek-harness git submodule and other directories
      # that are not needed for building the TUI. The patches/ directory MUST
      # be included because pnpm-workspace.yaml references patch files there.
      filterSrc = root:
        let
          base = toString root;
        in
        pkgs': path: type:
          let
            rel = pkgs'.lib.removePrefix base path;
          in
          (
            # Exclude the deepseek-harness submodule (large, not in workspace)
            !pkgs'.lib.hasPrefix "/deepseek-harness" rel &&
            # Exclude VCS and tooling directories
            !pkgs'.lib.hasPrefix "/.git" rel &&
            !pkgs'.lib.hasPrefix "/.agents" rel &&
            !pkgs'.lib.hasPrefix "/.claude" rel &&
            !pkgs'.lib.hasPrefix "/.specify" rel &&
            !pkgs'.lib.hasPrefix "/.github" rel &&
            # Exclude documentation and spec directories
            !pkgs'.lib.hasPrefix "/specs" rel &&
            !pkgs'.lib.hasPrefix "/docs" rel &&
            # Exclude media assets
            !pkgs'.lib.hasPrefix "/assets" rel &&
            rel != "/acryl-logo.png" &&
            rel != "/acryl-logo-white.png" &&
            # Exclude Nix build outputs
            !pkgs'.lib.hasPrefix "/result" rel
          );
    in
    {
      packages = forAllSystems ({ pkgs, system }:
        let
          pnpm = pkgs.pnpm_11;
          version = (pkgs.lib.importJSON ./package.json).version;

          src = pkgs.lib.cleanSourceWith {
            src = ./.;
            filter = filterSrc ./. pkgs;
            name = "acryl-source";
          };

          pnpmDeps = pkgs.fetchPnpmDeps {
            pname = "acryl";
            inherit version src pnpm;
            fetcherVersion = 4;
            hash = "sha256-eSJETc4rpA3jrGHOqVcatiLxlhOeg5cpX9wOL2r+3eA=";
          };
        in
        {
          default = self.packages.${system}.acryl;

          acryl = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "acryl";
            inherit version src pnpmDeps pnpm;

            nativeBuildInputs = [
              pkgs.nodejs_22
              pkgs.pnpmConfigHook
              pnpm
              pkgs.makeWrapper
            ];

            # esbuild's postinstall (which downloads a platform binary) is
            # skipped by --ignore-scripts in pnpmConfigHook. Point
            # tsdown/esbuild at the nixpkgs-provided binary instead.
            env.ESBUILD_BINARY_PATH = "${pkgs.esbuild}/bin/esbuild";

            # Force hoisted node-linker so all dependencies are flattened
            # into a single node_modules/ directory (like npm's layout).
            # In pnpm 11, this setting moved from .npmrc to pnpm-workspace.yaml
            # as "nodeLinker". The project's .npmrc still has the old key.
            preConfigure = ''
              if ! grep -q "nodeLinker" pnpm-workspace.yaml; then
                sed -i.bak '1i nodeLinker: hoisted' pnpm-workspace.yaml
                rm -f pnpm-workspace.yaml.bak
              fi
            '';

            # Don't let pnpmBuildHook run the root "build" script (which
            # builds ALL workspace packages including the Electron desktop
            # app). We build only the TUI dependency chain manually.
            dontPnpmBuild = true;

            # Don't strip debug symbols from JS files in node_modules —
            # Nix's strip phase runs `strip -S` on every file, which is
            # extremely slow for thousands of .js files and unnecessary
            # for interpreted JavaScript.
            dontStrip = true;

            # Skip the entire fixup phase (strip, patchShebangs on output,
            # broken symlink check). The build phase already runs
            # patchShebangs via pnpmConfigHook, and the fixup phase's
            # `find -type l` scan over 800+ MB of node_modules is very slow.
            dontFixup = true;

            buildPhase = ''
              runHook preBuild

              # Build the TUI dependency chain.
              # acryl-harness-runtime imports types from acryl-control, so
              # acryl-control must be built first. Then acryl-harness-runtime,
              # then acryl-tui (which depends on both).
              pnpm --filter acryl-control run build
              pnpm --filter acryl-harness-runtime run build
              pnpm --filter acryl-tui run build

              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall

              mkdir -p $out/lib/acryl $out/bin

              # Copy the built TUI
              cp -r acryl-tui/lib $out/lib/acryl/lib
              cp acryl-tui/package.json $out/lib/acryl/

              # With node-linker=hoisted, node_modules/ is a flat directory
              # (like npm's layout) with no .pnpm/ virtual store symlinks.
              # Just copy it as-is.
              cp -a node_modules $out/lib/acryl/node_modules

              # Replace workspace package symlinks/dirs with actual built
              # packages (the hoisted linker may have created symlinks for
              # workspace packages that point to source directories).
              rm -rf $out/lib/acryl/node_modules/acryl-control
              mkdir -p $out/lib/acryl/node_modules/acryl-control
              cp -r acryl-control/lib $out/lib/acryl/node_modules/acryl-control/lib
              cp acryl-control/package.json $out/lib/acryl/node_modules/acryl-control/

              rm -rf $out/lib/acryl/node_modules/acryl-harness-runtime
              mkdir -p $out/lib/acryl/node_modules/acryl-harness-runtime
              cp -r acryl-harness-runtime/lib $out/lib/acryl/node_modules/acryl-harness-runtime/lib
              cp acryl-harness-runtime/package.json $out/lib/acryl/node_modules/acryl-harness-runtime/

              # Wrap the TUI entry point
              makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/acryl \
                --add-flags "$out/lib/acryl/lib/bin.js"

              runHook postInstall
            '';

            meta = with pkgs.lib; {
              description = "ACRYL local-first plugin-native agent workspace (TUI)";
              homepage = "https://github.com/levonk/acryl";
              license = licenses.mit;
              mainProgram = "acryl";
              platforms = platforms.unix;
            };
          });
        });

      devShells = forAllSystems ({ pkgs, system }: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpm_11
            esbuild
          ];
        };
      });
    };
}
