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

      # Prebuilt CLI release tarballs (v0.1.19). Each tarball bundles its
      # own Node runtime and native addons (node-pty, koffi, sharp).
      releaseVersion = "0.1.19";
      prebuiltAssets = {
        "x86_64-linux" = {
          url = "https://github.com/acryldev/acryl/releases/download/v${releaseVersion}/acryl-cli-linux-x64.tar.gz";
          hash = "sha256-cTlDn36FUJ69bLLKSqfXYBCcU2AMVL0GuTJ+y32833s=";
        };
        "aarch64-linux" = {
          url = "https://github.com/acryldev/acryl/releases/download/v${releaseVersion}/acryl-cli-linux-arm64.tar.gz";
          hash = "sha256-/XNe8kTxF5/AgV1xeHg7kKeT9humvoH0MKcp81+/uLE=";
        };
        "x86_64-darwin" = {
          url = "https://github.com/acryldev/acryl/releases/download/v${releaseVersion}/acryl-cli-darwin-x64.tar.gz";
          hash = "sha256-8pvnuU0Z5+GOGAHKS+k6ucApZEBq55cnP0XK9H0t/hQ=";
        };
        "aarch64-darwin" = {
          url = "https://github.com/acryldev/acryl/releases/download/v${releaseVersion}/acryl-cli-darwin-arm64.tar.gz";
          hash = "sha256-8W0Df1ZyLSEr+aYDmxGIWqEv43mZwRIJYgoDyWlfTqA=";
        };
      };
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

          # Shared flags for both TUI and desktop derivations.
          commonDerivationAttrs = {
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
            # builds ALL workspace packages). We build only the needed
            # dependency chains manually in each derivation's buildPhase.
            dontPnpmBuild = true;

            # Don't strip debug symbols from JS files in node_modules —
            # Nix's strip phase runs `strip -S` on every file, which is
            # extremely slow for thousands of .js files and unnecessary
            # for interpreted JavaScript.
            dontStrip = true;

            # Skip the entire fixup phase (strip, patchShebangs on output,
            # broken symlink check). The build phase already runs
            # patchShebangs via pnpmConfigHook, and the fixup phase's
            # `find -type l` scan over node_modules is very slow.
            dontFixup = true;
          };

          # Helper to install a built workspace package into a node_modules
          # directory, replacing any symlink/dir that the hoisted linker
          # may have created.
          installWorkspacePackage = pkgDir: destDir: ''
            rm -rf ${destDir}/${pkgDir}
            mkdir -p ${destDir}/${pkgDir}
            cp -r ${pkgDir}/lib ${destDir}/${pkgDir}/lib
            cp ${pkgDir}/package.json ${destDir}/${pkgDir}/
          '';
        in
        {
          default = self.packages.${system}.acryl;

          # Prebuilt CLI tarball — bundles its own Node runtime and native
          # addons (node-pty, koffi, sharp). Fast path for users who want
          # the exact release binary without a from-source build.
          prebuilt = pkgs.stdenv.mkDerivation {
            pname = "acryl-prebuilt";
            inherit (commonDerivationAttrs) version;

            src = pkgs.fetchurl {
              url = prebuiltAssets.${system}.url;
              hash = prebuiltAssets.${system}.hash;
            };

            sourceRoot = ".";

            nativeBuildInputs = pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.autoPatchelfHook ];
            buildInputs = pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.stdenv.cc.cc.lib ];

            dontConfigure = true;
            dontBuild = true;

            installPhase = ''
              runHook preInstall
              mkdir -p $out
              cp -r acryl-cli-*/bin $out/bin
              cp -r acryl-cli-*/lib $out/lib
              cp -r acryl-cli-*/node_modules $out/node_modules
              cp acryl-cli-*/package.json $out/
              chmod +x $out/bin/acryl
              runHook postInstall
            '';

            meta = with pkgs.lib; {
              description = "ACRYL TUI (prebuilt release binary)";
              homepage = "https://github.com/acryldev/acryl";
              downloadPage = "https://github.com/acryldev/acryl/releases";
              license = licenses.mit;
              mainProgram = "acryl";
              platforms = builtins.attrNames prebuiltAssets;
              sourceProvenance = [ sourceTypes.binaryNativeCode ];
            };
          };

          acryl = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "acryl";
            inherit (commonDerivationAttrs) version src pnpmDeps pnpm nativeBuildInputs preConfigure dontPnpmBuild dontStrip dontFixup;
            env.ESBUILD_BINARY_PATH = commonDerivationAttrs.env.ESBUILD_BINARY_PATH;

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
              ${installWorkspacePackage "acryl-control" "$out/lib/acryl/node_modules"}
              ${installWorkspacePackage "acryl-harness-runtime" "$out/lib/acryl/node_modules"}

              # Wrap the TUI entry point
              makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/acryl \
                --add-flags "$out/lib/acryl/lib/bin.js"

              runHook postInstall
            '';

            meta = with pkgs.lib; {
              description = "ACRYL local-first plugin-native agent workspace (TUI)";
              homepage = "https://github.com/acryldev/acryl";
              license = licenses.mit;
              mainProgram = "acryl";
              platforms = platforms.unix;
            };
          });

          acryl-desktop = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "acryl-desktop";
            inherit (commonDerivationAttrs) version src pnpmDeps pnpm nativeBuildInputs preConfigure dontPnpmBuild dontStrip dontFixup;
            env.ESBUILD_BINARY_PATH = commonDerivationAttrs.env.ESBUILD_BINARY_PATH;

            # Electron is needed at build time for vite and at runtime.
            # nixpkgs electron (43.1.0) is close to the project's 43.4.0.
            buildInputs = [ pkgs.electron ];

            buildPhase = ''
              runHook preBuild

              # Build the full dependency chain for the desktop app.
              # Order matters: each package imports types from its deps.
              pnpm --filter acryl-control run build
              pnpm --filter acryl-harness-runtime run build
              pnpm --filter dsh-community-market run build
              pnpm --filter acryl-development-canvas run build

              # Build the desktop package. Skip the generate-* scripts
              # (they use sharp for image processing) since the build/
              # directory with pre-generated assets is already tracked
              # in git. Run tsdown, vite, and tsc directly.
              pnpm --filter acryl-desktop exec tsdown
              pnpm --filter acryl-desktop exec vite build --config vite.native-ui.config.ts
              pnpm --filter acryl-desktop exec tsc -p tsconfig.json --emitDeclarationOnly
              pnpm --filter acryl-desktop exec tsc -p tsconfig.client.json --emitDeclarationOnly

              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall

              mkdir -p $out/lib/acryl-desktop $out/bin

              # Copy the built desktop package
              cp -r acryl-desktop/lib $out/lib/acryl-desktop/lib
              cp -r acryl-desktop/build $out/lib/acryl-desktop/build
              cp acryl-desktop/package.json $out/lib/acryl-desktop/
              cp acryl-desktop/cordis.patch.yml $out/lib/acryl-desktop/ 2>/dev/null || true

              # Copy node_modules (hoisted, flat layout)
              cp -a node_modules $out/lib/acryl-desktop/node_modules

              # Replace workspace packages with built versions
              ${installWorkspacePackage "acryl-control" "$out/lib/acryl-desktop/node_modules"}
              ${installWorkspacePackage "acryl-harness-runtime" "$out/lib/acryl-desktop/node_modules"}
              ${installWorkspacePackage "dsh-community-market" "$out/lib/acryl-desktop/node_modules"}
              ${installWorkspacePackage "acryl-development-canvas" "$out/lib/acryl-desktop/node_modules"}
              ${installWorkspacePackage "acryl-desktop" "$out/lib/acryl-desktop/node_modules"}

              # Create a shim for the 'electron' npm package that exports
              # the nixpkgs electron path. The desktop launcher does
              # `import('electron')` to get the binary path; the real npm
              # package downloads a platform binary via postinstall (blocked
              # by --ignore-scripts), so we replace it with a CJS module
              # that returns the nixpkgs electron path.
              rm -rf $out/lib/acryl-desktop/node_modules/electron
              mkdir -p $out/lib/acryl-desktop/node_modules/electron
              cat > $out/lib/acryl-desktop/node_modules/electron/index.js <<ELECTRON_SHIM
              module.exports = "${pkgs.electron}/bin/electron"
              ELECTRON_SHIM
              cat > $out/lib/acryl-desktop/node_modules/electron/package.json <<'ELECTRON_PKG'
              { "name": "electron", "version": "43.1.0", "main": "index.js" }
              ELECTRON_PKG

              # Wrap the desktop launcher. The launcher (bin.ts) imports
              # 'electron' to get the path, then spawns it with main.js.
              makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/acryl-desktop \
                --add-flags "$out/lib/acryl-desktop/lib/bin.js"

              runHook postInstall
            '';

            meta = with pkgs.lib; {
              description = "ACRYL local-first plugin-native agent workspace (Desktop)";
              homepage = "https://github.com/acryldev/acryl";
              license = licenses.mit;
              mainProgram = "acryl-desktop";
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
