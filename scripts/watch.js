const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

const gifWorkerContent = fs.readFileSync(
  path.join(root, 'node_modules/gif.js/dist/gif.worker.js'),
  'utf-8',
)

function writeHtml() {
  const hasCss = fs.existsSync(path.join(root, 'dist/ui.css'))
  const cssTag = hasCss ? '<link rel="stylesheet" href="ui.css">' : ''
  fs.writeFileSync(
    path.join(root, 'dist/ui.html'),
    `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${cssTag}
</head>
<body>
<div id="create-figma-plugin"></div>
<script src="ui.js"></script>
</body>
</html>
`,
  )
}

const fixFigmaPluginCssImports = {
  name: 'fix-figma-plugin-css',
  setup(build) {
    build.onResolve({ filter: /^!/ }, (args) => ({
      path: path.resolve(path.dirname(args.importer), args.path.slice(1)),
    }))
  },
}

async function watch() {
  const codeCtx = await esbuild.context({
    entryPoints: [path.join(root, 'src/code.ts')],
    bundle: true,
    outfile: path.join(root, 'dist/code.js'),
    target: 'es2017',
  })

  const uiCtx = await esbuild.context({
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
    plugins: [fixFigmaPluginCssImports,
      {
        name: 'write-html',
        setup(build) {
          build.onEnd(() => writeHtml())
        },
      },
    ],
  })

  await Promise.all([codeCtx.watch(), uiCtx.watch()])
  console.log('Watching src/ for changes...')
}

watch().catch((e) => {
  console.error(e)
  process.exit(1)
})
