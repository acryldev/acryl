import { defineConfig } from 'tsdown'

export default defineConfig({
  name: 'acryl-agent-devin',
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: true,
  sourcemap: true,
  external: ['acryl-control', '@deepseek-ai/schemastery'],
})
