import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    main: 'electron/main.ts',
    preload: 'electron/preload.ts',
  },
  clean: true,
  dts: false,
  external: ['electron'],
  format: ['cjs'],
  outDir: 'dist-electron',
  platform: 'node',
  sourcemap: true,
  target: 'node20',
  outExtension() {
    return {
      js: '.cjs',
    }
  },
})
