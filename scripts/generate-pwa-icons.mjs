/**
 * Generates PNG icons for PWA / Apple touch from public/logo.png.
 * Run: npm run icons:pwa
 */
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const logoPath = join(root, 'public', 'logo.png')
const outDir = join(root, 'public', 'icons')

const BRAND = { r: 134, g: 59, b: 255, alpha: 1 } // #863bff

const resizeLogo = (w, h) =>
  sharp(logoPath).resize(w, h, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })

async function main() {
  await mkdir(outDir, { recursive: true })

  await resizeLogo(192, 192).png().toFile(join(outDir, 'pwa-192.png'))
  await resizeLogo(512, 512).png().toFile(join(outDir, 'pwa-512.png'))
  await resizeLogo(180, 180).png().toFile(join(outDir, 'apple-touch-icon.png'))

  const size = 512
  const inner = Math.floor(size * 0.8)
  const pad = Math.floor((size - inner) / 2)
  const innerBuf = await sharp(logoPath)
    .resize(inner, inner, { fit: 'contain', background: BRAND })
    .png()
    .toBuffer()
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND,
    },
  })
    .composite([{ input: innerBuf, left: pad, top: pad }])
    .png()
    .toFile(join(outDir, 'pwa-512-maskable.png'))

  console.log('PWA icons written to public/icons/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
