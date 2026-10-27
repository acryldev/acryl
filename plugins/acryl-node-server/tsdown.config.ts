import { defineConfig } from 'tsdown'

export default defineConfig({
  name: 'acryl-node-server',
  entry: { index: 'src/index.ts', register: 'src/register.ts', 'client-modules': 'src/client-modules.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  sourcemap: true,
})
