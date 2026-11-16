import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Link previews need full addresses. On Vercel the production domain comes from the
// build environment; SITE_URL overrides it (set it when a custom domain is added).
const site = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : '')
const siteUrl = (): Plugin => ({ name: 'site-url', transformIndexHtml: html => html.replaceAll('__SITE_URL__', site) })

export default defineConfig({ plugins: [react(), siteUrl()], base: './' })
