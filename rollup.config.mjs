import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';

const banner = `/**
 * @license MIT
 * Copyright (c) 2025 SGNL.ai, Inc.
 */`;

export default {
  input: 'src/script.mjs',
  output: {
    file: 'dist/index.js',
    format: 'esm',
    banner
  },
  plugins: [
    nodeResolve({ preferBuiltins: false }),
    commonjs(),
    json(),
    terser({ format: { comments: /(@license|@preserve|^!)/ } })
  ]
};
