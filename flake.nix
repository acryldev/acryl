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

      # Prebuilt CLI release tarballs (v0.1.36). Each tarball bundles its
      # own Node runtime and native addons (node-pty, koffi, sharp).
      # v0.1.36 does not ship a darwin-x64 tarball, so #prebuilt is not
      # available on x86_64-darwin — use #default or #acryl there.
      releaseVersion = "0.1.36";
      prebuiltAssets = {
        "x86_64-linux" = {
          url = "https://github.com/acryldev/acryl/releases/download/v${releaseVersion}/acryl-cli-linux-x64.tar.gz";
          hash = "sha256-hGYEZPmdPC9IfRyIcwWsvq3wiDGHPJ2AHGumKI2UJSE=";
        };
        "aarch64-linux" = {
          url = "https://github.com/acryldev/acryl/releases/download/v${releaseVersion}/acryl-cli-linux-arm64.tar.gz";
          hash = "sha256-6Op6wXArwHQuGd42feZeDXRMEsLRE2He4TvxzmcbFOk=";
        };
        "aarch64-darwin" = {
          url = "https://github.com/acryldev/acryl/releases/download/v${releaseVersion}/acryl-cli-darwin-arm64.tar.gz";
          hash = "sha256-aP2zpAdfML8VJXinM0AqSKPdHNECB4EqarPoGAbXJyo=";
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
            hash = "sha256-UEV9oC6cve7yNPxTYHnfZCfG1bKICKpkXMaXj0CKWsQ=";
          };

          # Shared flags for the TUI derivation.
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
            # as "nodeLinker". The project's pnpm-workspace.yaml has
            # nodeLinker: isolated (symlink-based .pnpm/ virtual store) which
            # doesn't survive the Nix store copy — symlinks break. Replace it
            # with hoisted so all packages are real directories.
            preConfigure = ''
              if grep -q "nodeLinker" pnpm-workspace.yaml; then
                sed -i.bak 's/nodeLinker:.*/nodeLinker: hoisted/' pnpm-workspace.yaml
                rm -f pnpm-workspace.yaml.bak
              else
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
          # may have created. srcDir is the workspace path (e.g.
          # "runtime/control"), pkgName is the node_modules name
          # (e.g. "@acryldev/control"). extraDirs is a list of additional
          # subdirectories to copy (e.g. ["docs"] for packages that read
          # non-compiled assets at runtime; pass [] when not needed).
          installWorkspacePackage = srcDir: pkgName: destDir: extraDirs:
            let copyExtra = pkgs.lib.concatMapStrings (d: ''
              cp -r ${srcDir}/${d} ${destDir}/${pkgName}/${d}
            '') extraDirs;
            in ''
            rm -rf ${destDir}/${pkgName}
            mkdir -p ${destDir}/${pkgName}
            cp -r ${srcDir}/lib ${destDir}/${pkgName}/lib
            cp ${srcDir}/package.json ${destDir}/${pkgName}/
            ${copyExtra}
          '';
        in
        {
          default = self.packages.${system}.acryl;

          acryl = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "acryl";
            inherit (commonDerivationAttrs) version src pnpmDeps pnpm nativeBuildInputs preConfigure dontPnpmBuild dontStrip dontFixup;
            env.ESBUILD_BINARY_PATH = commonDerivationAttrs.env.ESBUILD_BINARY_PATH;

            buildPhase = ''
              runHook preBuild

              # Build the TUI dependency chain.
              # @acryldev/harness-runtime imports types from @acryldev/control, so
              # @acryldev/control must be built first. Then @acryldev/harness-runtime,
              # then dsh-community-market (imported by acryl-cli's /market
              # command), then acryl-cli (which depends on all three;
              # renamed from acryl-tui upstream).
              pnpm --filter @acryldev/control run build
              pnpm --filter @acryldev/harness-runtime run build
              pnpm --filter dsh-community-market run build
              pnpm --filter acryl-cli run build

              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall

              mkdir -p $out/lib/acryl $out/bin

              # Copy the built TUI
              cp -r apps/acryl-cli/lib $out/lib/acryl/lib
              cp apps/acryl-cli/package.json $out/lib/acryl/

              # With node-linker=hoisted, node_modules/ is a flat directory
              # (like npm's layout) with no .pnpm/ virtual store symlinks.
              # Just copy it as-is.
              cp -a node_modules $out/lib/acryl/node_modules

              # Replace workspace package symlinks/dirs with actual built
              # packages (the hoisted linker may have created symlinks for
              # workspace packages that point to source directories).
              ${installWorkspacePackage "runtime/control" "@acryldev/control" "$out/lib/acryl/node_modules" []}
              ${installWorkspacePackage "runtime/harness-runtime" "@acryldev/harness-runtime" "$out/lib/acryl/node_modules" []}
              ${installWorkspacePackage "plugins/dsh-community-market" "dsh-community-market" "$out/lib/acryl/node_modules" ["docs"]}

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
        }
        // pkgs.lib.optionalAttrs (prebuiltAssets ? ${system}) {
          # Prebuilt CLI tarball — bundles its own Node runtime and native
          # addons (node-pty, koffi, sharp). Fast path for users who want
          # the exact release binary without a from-source build.
          # Only exposed on platforms with a release asset.
          prebuilt = pkgs.stdenv.mkDerivation {
            pname = "acryl-prebuilt";
            inherit (commonDerivationAttrs) version;

            src = pkgs.fetchurl {
              url = prebuiltAssets.${system}.url;
              hash = prebuiltAssets.${system}.hash;
            };

            sourceRoot = ".";

            # The prebuilt tarball bundles both glibc-linked and musl-linked
            # native addons (koffi ships musl_x64/koffi.node alongside
            # linux_x64/koffi.node). autoPatchelf needs both glibc and musl
            # available to satisfy all shared library dependencies.
            nativeBuildInputs = pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.autoPatchelfHook ];
            buildInputs = pkgs.lib.optionals pkgs.stdenv.isLinux [
              pkgs.stdenv.cc.cc.lib
              pkgs.musl
            ];

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
