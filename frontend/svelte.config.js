import adapter from '@sveltejs/adapter-static';
import preprocess from 'svelte-preprocess';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://github.com/sveltejs/svelte-preprocess
  // for more information about preprocessors
  preprocess: preprocess({
    postcss: true,
    typescript: {
      // Skip type checking to avoid TS 5.5+ incompatibilities with deprecated options
      tsconfigFile: false,
      compilerOptions: {
        target: 'esnext',
        module: 'esnext',
        moduleResolution: 'node',
        isolatedModules: true,
        esModuleInterop: true,
        skipLibCheck: true,
        sourceMap: true
      }
    }
  }),

  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html'
    }),
    paths: {
      base: process.env.BASE_PATH || '/timeless-jewels'
    }
  }
};

export default config;
