// 为 jsdom 冒烟打一个单文件构建：路由懒加载 chunk 全部内联进入口，免去 file:// 下的网络加载。
import { build } from 'vite'

await build({
  configFile: new URL('../vite.config.ts', import.meta.url).pathname,
  logLevel: 'warn',
  build: {
    outDir: 'dist-smoke',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'entry.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
})
console.log('smoke build done')
