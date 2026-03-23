const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

function loadEnv(mode) {
  const candidates = [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']
  const result = {}
  for (const file of [...candidates].reverse()) {
    const filePath = path.join(root, file)
    if (!fs.existsSync(filePath)) continue
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      result[key] = val
    }
  }
  return result
}

const { execSync } = require('child_process')

const env = loadEnv('development')
const envDefine = Object.fromEntries(
  ['POSTHOG_KEY', 'POSTHOG_HOST'].map((k) => [`__${k}__`, JSON.stringify(env[k] ?? '')])
)

let version
try {
  version = execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim()
} catch {
  version = require('../package.json').version
}
envDefine['__VERSION__'] = JSON.stringify(version)
envDefine['__DEV__'] = JSON.stringify(true)
envDefine['__LOG_SERVER__'] = JSON.stringify(env.LOG_SERVER ?? '')

const gifWorkerContent = fs.readFileSync(
  path.join(root, 'node_modules/gif.js/dist/gif.worker.js'),
  'utf-8',
)

/**
 * Writes the inlined ui.html from in-memory JS and CSS strings.
 * @param {string} jsContent - Bundled JS to inline in a script tag.
 * @param {string} cssContent - Bundled CSS to inline in a style tag.
 */
function writeHtml(jsContent, cssContent) {
  const cssTag = cssContent ? `<style>${cssContent}</style>` : ''
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
<script>${jsContent}</script>
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

if (env.LOG_SERVER) {
  let logServer = require('./log-server')
  fs.watch(path.join(__dirname, 'log-server.js'), { persistent: false }, () => {
    logServer.close(() => {
      delete require.cache[require.resolve('./log-server')]
      logServer = require('./log-server')
    })
  })
}

function writeManifest() {
  delete require.cache[require.resolve('../manifest.js')]
  const manifest = require('../manifest.js')(env)
  fs.writeFileSync(path.join(root, 'dist/manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('✓ dist/manifest.json')
}

// Clean dist/ once on startup to avoid stale artifacts; then regenerate manifest
const distDir = path.join(root, 'dist')
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true })
}
fs.mkdirSync(distDir)

writeManifest()
fs.watch(path.join(root, 'manifest.js'), () => writeManifest())

async function watch() {
  const codeCtx = await esbuild.context({
    entryPoints: [path.join(root, 'src/app/figma.ts')],
    bundle: true,
    outfile: path.join(root, 'dist/code.js'),
    target: 'es2017',
  })

  const uiCtx = await esbuild.context({
    entryPoints: { ui: path.join(root, 'src/app/index.tsx') },
    bundle: true,
    outdir: path.join(root, 'dist'),
    // write: false — JS/CSS stay in memory; only ui.html is written to dist/
    write: false,
    jsx: 'automatic',
    jsxImportSource: 'preact',
    alias: {
      react: path.resolve(root, 'node_modules/preact/compat/dist/compat.module.js'),
      'react-dom': path.resolve(root, 'node_modules/preact/compat/dist/compat.module.js'),
      'react/jsx-runtime': path.resolve(root, 'node_modules/preact/jsx-runtime/dist/jsxRuntime.module.js'),
    },
    define: {
      __GIF_WORKER_CONTENT__: JSON.stringify(gifWorkerContent),
      ...envDefine,
    },
    loader: { '.css': 'css' },
    target: 'es2017',
    plugins: [
      fixFigmaPluginCssImports,
      {
        name: 'write-html',
        setup(build) {
          build.onEnd((result) => {
            const jsFile = result.outputFiles?.find((f) => f.path.endsWith('.js'))
            const cssFile = result.outputFiles?.find((f) => f.path.endsWith('.css'))
            const jsContent = jsFile ? Buffer.from(jsFile.contents).toString('utf-8') : ''
            const cssContent = cssFile ? Buffer.from(cssFile.contents).toString('utf-8') : ''
            writeHtml(jsContent, cssContent)
          })
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
