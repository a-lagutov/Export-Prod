module.exports = (env) => ({
  name: env.PLUGIN_NAME || '',
  id: '1616402881533961813',
  api: '1.0.0',
  main: 'code.js',
  ui: 'ui.html',
  documentAccess: 'dynamic-page',
  editorType: ['figma'],
  networkAccess: {
    allowedDomains: [
      ...(env.POSTHOG_HOST ? [env.POSTHOG_HOST] : []),
    ],
    ...(env.LOG_SERVER ? { devAllowedDomains: [env.LOG_SERVER] } : {}),
  },
})
