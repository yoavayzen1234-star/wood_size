import type { jsPDF } from 'jspdf'
import { HEEBO_TTF_BASE64 } from './heeboBase64'

/**
 * Register a Hebrew-capable font in jsPDF via embedded Base64 TTF.
 * Must be called before rendering any Hebrew text.
 */
export function registerHebrewFont(pdf: jsPDF): void {
  const fontFileName = 'Heebo-wght.ttf'
  const fontName = 'Heebo'

  // Prevent duplicate registration if export is called multiple times.
  // jsPDF doesn't expose a stable "has font" API, so we do a best-effort try/catch.
  try {
    const fontList = (pdf as unknown as { getFontList?: () => Record<string, unknown> }).getFontList?.()
    if (fontList && fontName in fontList) {
      pdf.setFont(fontName, 'normal')
      return
    }
  } catch {
    /* ignore */
  }

  pdf.addFileToVFS(fontFileName, HEEBO_TTF_BASE64)
  // Register both normal + bold so autotable headers (fontStyle: 'bold')
  // won't fall back to a non-Hebrew default font (causing "gibberish").
  pdf.addFont(fontFileName, fontName, 'normal')
  pdf.addFont(fontFileName, fontName, 'bold')
  pdf.setFont(fontName, 'normal')
}

