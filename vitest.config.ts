import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const alias = {
  '@renderer': resolve('src/renderer/src'),
  '@shared': resolve('src/shared'),
};

/** `worktrees/` holds live checkouts of this same repository — without this,
 * every run would discover and execute a second copy of the suite. */
const exclude = ['**/node_modules/**', 'worktrees/**', 'out/**', 'dist/**'];

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/{main,preload,shared}/**/*.test.ts'],
          exclude,
          passWithNoTests: true,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['src/renderer/src/test-setup.ts'],
          exclude,
          passWithNoTests: true,
        },
      },
    ],
  },
});
