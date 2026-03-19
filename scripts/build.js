const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

async function build() {
  // 1. Bundle code.ts → dist/code.js
  await esbuild.build({
    entryPoints: [path.join(root, 'src/code.ts')],
    bundle: true,
    outfile: path.join(root, 'dist/code.js'),
    target: 'es2017',
  })
  console.log('✓ dist/code.js')

  // 2. Read gif.worker.js content — injected into UI bundle via define
  const gifWorkerContent = fs.readFileSync(
    path.join(root, 'node_modules/gif.js/dist/gif.worker.js'),
    'utf-8',
  )

  // Plugin: @create-figma-plugin/ui uses webpack "!" prefix to skip loaders.
  // Strip the "!" and resolve the CSS path normally.
  const fixFigmaPluginCssImports = {
    name: 'fix-figma-plugin-css',
    setup(build) {
      build.onResolve({ filter: /^!/ }, (args) => ({
        path: path.resolve(path.dirname(args.importer), args.path.slice(1)),
      }))
    },
  }

  // 3. Bundle ui.tsx → dist/ui.js (and dist/ui.css if any CSS imports exist)
  await esbuild.build({
    entryPoints: [path.join(root, 'src/ui.tsx')],
    bundle: true,
    outdir: path.join(root, 'dist'),
    jsx: 'automatic',
    jsxImportSource: 'preact',
    define: {
      __GIF_WORKER_CONTENT__: JSON.stringify(gifWorkerContent),
    },
    loader: { '.css': 'css' },
    target: 'es2017',
    plugins: [fixFigmaPluginCssImports],
  })
  console.log('✓ dist/ui.js')

  // 4. Generate dist/ui.html — inline JS and CSS (Figma doesn't resolve external files)
  const jsContent = fs.readFileSync(path.join(root, 'dist/ui.js'), 'utf-8')
  const hasCss = fs.existsSync(path.join(root, 'dist/ui.css'))
  const cssContent = hasCss ? fs.readFileSync(path.join(root, 'dist/ui.css'), 'utf-8') : ''
  const cssTag = cssContent ? `<style>${cssContent}</style>` : ''
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${cssTag}
</head>
<body>
<div id="create-figma-plugin"></div>
<script>${jsContent}</script>
</body>
</html>
`
  fs.writeFileSync(path.join(root, 'dist/ui.html'), html)
  console.log('✓ dist/ui.html')

  // 5. Copy manifest.json from root → dist/manifest.json
  fs.copyFileSync(path.join(root, 'manifest.json'), path.join(root, 'dist/manifest.json'))
  console.log('✓ dist/manifest.json')
}

build().catch((e) => {
  console.error(e)
  process.exit(1)
})
