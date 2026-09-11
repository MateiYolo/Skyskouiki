import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    /**
     * Le même alias que `tsconfig.json`.
     *
     * Il n'a longtemps pas manqué : les modules clients testés ici n'importaient
     * du moteur que des *types*, effacés à la compilation, donc aucun chemin
     * n'était résolu à l'exécution. Dès qu'un seul d'entre eux importe une
     * valeur — une constante de carte, une fonction de conversion — Vitest doit
     * savoir où va `@/`.
     */
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
