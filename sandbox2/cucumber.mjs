import { register } from 'tsx/esm/api';

// Registers tsx's ESM loader hooks for this process, so `.ts` files under
// `import` below can be loaded without the caller having to pass
// `NODE_OPTIONS=--import=tsx` themselves.
register();

export default {
  import: ['features/support/**/*.ts', 'features/step_definitions/**/*.ts'],
  paths: ['features/**/*.feature'],
};
