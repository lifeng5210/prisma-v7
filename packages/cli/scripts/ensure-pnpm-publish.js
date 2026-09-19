const userAgent = process.env.npm_config_user_agent ?? ''

if (!userAgent.startsWith('pnpm/')) {
  console.error('prisma-kb must be published with `pnpm publish` so workspace dependencies are converted to versions.')
  process.exit(1)
}
