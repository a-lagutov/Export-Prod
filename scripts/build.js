const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

// Load env files in CRA priority order (left = higher priority):
//   build:  .env.production.local > .env.local > .env.production > .env
//   watch:  .env.development.local > .env.local > .env.development > .env
//   test:   .env.test.local > .env.test > .env  (.env.local is skipped)
function loadEnv(mode) {
  const isTest = mode === 'test'
  const candidates = [
    `.env.${mode}.local`,
    ...(!isTest ? ['.env.local'] : []),
    `.env.${mode}`,
    '.env',
  ]
  const result = {}
  // Lowest priority first, higher priority overwrites
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

const mode = process.env.NODE_ENV || 'production'
const env = loadEnv(mode)

let version
try {
  version = execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim()
} catch {
  version = require('../package.json').version
}

// Inject POSTHOG_* vars as __VAR__ constants; always defined (empty string = analytics disabled)
const envDefine = Object.fromEntries(
  ['POSTHOG_KEY', 'POSTHOG_HOST'].map((k) => [`__${k}__`, JSON.stringify(env[k] ?? '')])
)
envDefine['__VERSION__'] = JSON.stringify(version)
envDefine['__DEV__'] = JSON.stringify(mode === 'development')

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
      ...envDefine,
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

  // 5. Generate dist/manifest.json from manifest.js + env
  const manifest = require('../manifest.js')(env)
  fs.writeFileSync(path.join(root, 'dist/manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('✓ dist/manifest.json')
}

build().catch((e) => {
  console.error(e)
  process.exit(1)
})
