import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      source: {
        entry: {
          routing: './src/routing.ts'
        }
      },
      format: 'umd',
      output: {
        sourceMap: true,
        target: "web",
      }
    },
    {
      bundle: true,
      autoExternal: false,
      output: {
        target: "web",
      },
      format: 'esm',
      syntax: 'es2021',
      dts: true,
    },
  ],
});
