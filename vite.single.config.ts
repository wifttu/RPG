import { viteSingleFile } from 'vite-plugin-singlefile';
import { defineConfig } from 'vitest/config';

/** 한 파일(HTML)로 합친 빌드: 링크 하나로 공유하거나 미리 보기 페이지에 올릴 때 사용 */
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    outDir: 'dist-single',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 20_000,
  },
});
