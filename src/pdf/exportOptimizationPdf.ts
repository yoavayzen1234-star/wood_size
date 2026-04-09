import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import bidiFactory from 'bidi-js'
import type { CatalogOptimizationResult, PackedBeam } from '../lib/cuttingOptimizer'
import { formatLocalDateIso } from '../numericFormat'
import { registerHebrewFont } from './registerHebrewFont'

type PdfRow = Array<string | number>

const bidi = bidiFactory()
const HEBREW_RE = /[\u0590-\u05FF]/
const INVISIBLE_BIDI_RE = /[\u200e\u200f\u202a-\u202e\u200b\u200c\u200d]/g

function toVisualRtl(text: string): string {
  if (!text) return ''
  // 1) Strip invisible bidi/control chars early (can render as boxes/arrows in PDF).
  const cleanInput = text.replace(INVISIBLE_BIDI_RE, '')
  if (!HEBREW_RE.test(cleanInput)) return cleanInput
  try {
    const embedding = bidi.getEmbeddingLevels(cleanInput)
    const b = bidi as unknown as {
      getReorderedString?: (t: string, emb: unknown) => string
    }
    if (typeof b.getReorderedString === 'function') {
      // getReorderedString handles both RTL reordering and mirroring of brackets/punctuation.
      const visual = b.getReorderedString(cleanInput, embedding)
      // 2) Strip again post-processing to ensure no artifacts remain.
      return visual.replace(INVISIBLE_BIDI_RE, '')
    }
  } catch (err) {
    console.error('Bidi error:', err)
    return cleanInput
  }
  // Fallback: if bidi-js API is different, keep original text to avoid crashing export.
  return cleanInput
}

function rtlCell(v: string | number) {
  if (typeof v === 'number') return v
  // Numeric-only strings should never be passed through bidi reordering.
  const s = v.trim()
  if (s !== '' && /^[0-9]+(\.[0-9]+)?$/.test(s)) return s
  return toVisualRtl(v)
}

function formatLengthCm(valCm: number): string {
  // CRITICAL: Keep numbers + unit LTR inside RTL documents.
  // Use Latin "cm" to avoid bidi reordering of the unit.
  const n = Number(valCm)
  const s = Number.isFinite(n) ? n.toFixed(1) : String(valCm)
  return `${s} cm`
}

function formatNumber1(val: number): string {
  const n = Number(val)
  return Number.isFinite(n) ? n.toFixed(1) : String(val)
}

function formatStockCmNumberOnly(mm: number): string {
  // Stock length is a number; keep it clean (no bidi, no hidden chars).
  return formatNumber1(mm / 10)
}

function downloadPdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function downloadPdf(pdf: jsPDF, fileName: string) {
  // Prefer jsPDF's built-in save, which tends to be more reliable across browsers.
  try {
    pdf.save(fileName)
    return
  } catch {
    /* fallback */
  }

  try {
    const blob = pdf.output('blob')
    downloadPdfBlob(blob, fileName)
    return
  } catch {
    /* fallback */
  }

  // Last resort: open in a new tab (may be blocked by popup settings).
  try {
    const url = pdf.output('bloburl')
    window.open(url, '_blank', 'noopener,noreferrer')
  } catch {
    // Give up silently; caller will handle messaging.
  }
}

function profileDisplay(material: string) {
  return (material || '—').replace('x', '×')
}

/** #1e293b — קו תחתון לכותרת «הוראות חיתוך» (רוחב הטקסט בלבד) */
const CUT_HEADER_RULE_RGB: [number, number, number] = [30, 41, 59]
/** 2px במ״מ (96dpi), כמו border-bottom בדפדפן */
const TITLE_UNDERLINE_WIDTH_MM = (2 * 25.4) / 96

/** קו תחתון באורך הטקסט בלבד; מיושר לימין (rightX = קצה ימין המסומן). */
function drawRightAlignedTextUnderline(
  pdf: jsPDF,
  visualText: string,
  rightX: number,
  baselineY: number,
): number {
  const w = pdf.getTextWidth(visualText)
  const fsPt = pdf.getFontSize()
  const underlineY = baselineY + fsPt * 0.3527 * 0.32
  pdf.setDrawColor(CUT_HEADER_RULE_RGB[0], CUT_HEADER_RULE_RGB[1], CUT_HEADER_RULE_RGB[2])
  pdf.setLineWidth(TITLE_UNDERLINE_WIDTH_MM)
  pdf.line(rightX - w, underlineY, rightX, underlineY)
  return underlineY
}

/**
 * כותרת משנה: «קורה - 10×10» — קורה בימין, המימדים משמאל (קריאה RTL); המימדים נשלחים בנפרד מבידי.
 */
function drawCuttingSubsectionHeader(
  pdf: jsPDF,
  material: string,
  rightX: number,
  baselineY: number,
): void {
  const dims = profileDisplay(material)
  const prefixVis = toVisualRtl('קורה - ')
  const wPrefix = pdf.getTextWidth(prefixVis)
  const gapMm = 1.0
  pdf.text(prefixVis, rightX, baselineY, { align: 'right' })
  pdf.text(dims, rightX - wPrefix - gapMm, baselineY, { align: 'right' })
}

function beamCutGroups(beam: PackedBeam): Array<{ length: string; qty: number }> {
  const tally = new Map<string, { count: number; firstIdx: number }>()
  let idx = 0
  for (const seg of beam.segments) {
    if (seg.kind !== 'part') continue
    const len = formatNumber1(seg.lengthMm / 10)
    const prev = tally.get(len)
    if (prev) prev.count += 1
    else tally.set(len, { count: 1, firstIdx: idx })
    idx += 1
  }
  return [...tally.entries()]
    .sort((a, b) => a[1].firstIdx - b[1].firstIdx)
    .map(([length, meta]) => ({ length, qty: meta.count }))
}

export function exportOptimizationPdf(result: CatalogOptimizationResult, fileName: string) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  registerHebrewFont(pdf)

  const pageW = pdf.internal.pageSize.getWidth()
  const marginX = 10
  pdf.setFontSize(16)
  pdf.text(toVisualRtl('רשימת חיתוך'), pageW / 2, 14, { align: 'center' })

  pdf.setFontSize(10)
  pdf.setTextColor(80)
  pdf.text(formatLocalDateIso(), pageW - marginX, 20, { align: 'right' })
  pdf.setTextColor(0)

  // ---- Table 0 + 1: Side-by-side summaries (Parts Key + Purchase Summary) ----
  const startY = 30
  const gap = 6 // ~20px
  const contentW = pageW - marginX * 2
  const rightW = 112
  const leftW = Math.max(50, contentW - rightW - gap)
  const leftX = marginX
  const rightX = marginX + leftW + gap

  const tableCommon = {
    styles: {
      font: 'Heebo',
      fontSize: 9,
      halign: 'right' as const,
      cellPadding: 1.9,
      lineColor: [215, 221, 232] as unknown as [number, number, number],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [30, 41, 59] as unknown as [number, number, number], // #1e293b
      textColor: 255,
      halign: 'right' as const,
      fontStyle: 'bold' as const,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] as unknown as [number, number, number] },
    theme: 'grid' as const,
  }

  // Titles aligned above each table (RTL container feel, but positioned explicitly)
  pdf.setFontSize(11)
  pdf.setTextColor(30)
  pdf.text(toVisualRtl('מפתח חלקים לפי ייעוד'), rightX + rightW, startY - 3, { align: 'right' })
  pdf.text(toVisualRtl('ריכוז רכישה'), leftX + leftW, startY - 3, { align: 'right' })
  pdf.setTextColor(0)

  const partsKeyTally = new Map<string, { profile: string; lengthCm: number; purpose: string; qty: number }>()
  for (const pat of result.patterns) {
    const mult = Math.max(1, Math.floor(pat.quantity))
    const beam = pat.beam
    const profile = profileDisplay(beam.material)
    for (const seg of beam.segments) {
      if (seg.kind !== 'part') continue
      const purpose = (seg.label || '—').trim() || '—'
      const lengthCm = seg.lengthMm / 10
      const key = `${profile}\t${lengthCm}\t${purpose}`
      const prev = partsKeyTally.get(key)
      if (prev) prev.qty += mult
      else partsKeyTally.set(key, { profile, lengthCm, purpose, qty: mult })
    }
  }

  const partsKeyRows: PdfRow[] = [...partsKeyTally.values()]
    .sort(
      (a, b) =>
        a.profile.localeCompare(b.profile, 'he') ||
        a.purpose.localeCompare(b.purpose, 'he') ||
        a.lengthCm - b.lengthCm,
    )
    // IMPORTANT: Column order in PDF is left-to-right. For RTL reading we want:
    // Rightmost: סוג קורה, then אורך, then כמות, then מטרה (leftmost).
    // So we emit: [מטרה, כמות, אורך, סוג קורה].
    .map((r) => [r.purpose, r.qty, formatNumber1(r.lengthCm), r.profile])

  // Right table: Parts Key
  autoTable(pdf, {
    startY,
    margin: { left: rightX, right: marginX },
    tableWidth: rightW,
    ...tableCommon,
    head: [[toVisualRtl('מטרה'), toVisualRtl('כמות'), toVisualRtl('אורך (ס"מ)'), toVisualRtl('סוג קורה')]],
    body: partsKeyRows.map((r) => r.map(rtlCell)),
    columnStyles: {
      0: { cellWidth: rightW - (14 + 18 + 26), halign: 'right' }, // purpose (Hebrew)
      1: { cellWidth: 14, halign: 'center' }, // qty
      2: { cellWidth: 18, halign: 'left' }, // length number
      3: { cellWidth: 26, halign: 'right' }, // profile
    },
  })

  // ---- Table 1: Shopping List (ריכוז רכישה) ----
  // autoTable draws columns LTR. For RTL reading — קורה right, אורך middle, כמות left —
  // pass [כמות, אורך, קורה] (same visual as dir=rtl with <th> order קורה, אורך, כמות).
  const shoppingRows: PdfRow[] = []
  for (const g of result.shoppingList) {
    for (const line of g.lines) {
      shoppingRows.push([line.count, formatLengthCm(line.lengthCm), profileDisplay(g.material)])
    }
  }

  const keyFinalY =
    (pdf as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? startY

  // Left table: Purchase Summary
  autoTable(pdf, {
    startY,
    margin: { left: leftX, right: marginX },
    tableWidth: leftW,
    ...tableCommon,
    head: [[toVisualRtl('כמות'), toVisualRtl('אורך'), toVisualRtl('קורה')]],
    body: shoppingRows.map((r) => r.map(rtlCell)),
    columnStyles: {
      0: { cellWidth: 16, halign: 'right' }, // כמות — physical left; header/body aligned with headStyles
      1: { cellWidth: 22, halign: 'left' }, // אורך (numbers LTR)
      2: { cellWidth: Math.max(30, leftW - (22 + 16)), halign: 'right' }, // קורה — physical right
    },
  })

  const purchaseFinalY =
    (pdf as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? startY
  const afterSummariesY = Math.max(keyFinalY, purchaseFinalY) + 10

  // ---- Table 2: Cutting Instructions (grouped patterns) ----
  const pageH = pdf.internal.pageSize.getHeight()
  const cuttingFooterSafeMm = 18
  /** מינימום מקום לפני כותרת משנה + תחילת טבלה (מניעת שבירה בין כותרת לטבלה) */
  const minCuttingSubsectionMm = 28

  const ensureCuttingY = (y: number, minNeeded: number): number => {
    if (y + minNeeded <= pageH - cuttingFooterSafeMm) return y
    pdf.addPage()
    return 20
  }

  const byMaterial = new Map<string, typeof result.patterns>()
  for (const p of result.patterns) {
    const m = p.beam.material || '—'
    const list = byMaterial.get(m)
    if (list) list.push(p)
    else byMaterial.set(m, [p])
  }

  const sortedMaterials = [...byMaterial.entries()].sort((a, b) => a[0].localeCompare(b[0], 'he'))

  // כותרת ראשית + לפחות כותרת משנה ראשונה — לא לשבור מיד אחרי «הוראות חיתוך»
  let cursorY = ensureCuttingY(afterSummariesY + 4, 38)

  pdf.setFont('Heebo', 'bold')
  pdf.setFontSize(12)
  pdf.setTextColor(0, 0, 0)
  const rightTitleX = pageW - marginX
  const mainTitleY = cursorY + 5
  const mainTitleVis = toVisualRtl('הוראות חיתוך')
  pdf.text(mainTitleVis, rightTitleX, mainTitleY, { align: 'right' })
  const mainUnderlineY = drawRightAlignedTextUnderline(pdf, mainTitleVis, rightTitleX, mainTitleY)
  /** מרווח קטן בין הקו התחתון לבין שורת «קורה - …» הראשונה */
  cursorY = mainUnderlineY + 5
  pdf.setFont('Heebo', 'normal')

  for (const [material, list] of sortedMaterials) {
    cursorY = ensureCuttingY(cursorY, minCuttingSubsectionMm)

    pdf.setFont('Heebo', 'bold')
    pdf.setFontSize(12)
    pdf.setTextColor(0, 0, 0)
    const subsectionTitleY = cursorY + 5
    drawCuttingSubsectionHeader(pdf, material, rightTitleX, subsectionTitleY)
    const fsPt = pdf.getFontSize()
    cursorY = subsectionTitleY + fsPt * 0.3527 * 1.35
    pdf.setFont('Heebo', 'normal')

    const cuttingCutsByRow = list.map((p) => beamCutGroups(p.beam))

    const cuttingRows: PdfRow[] = list.map((p) => {
      const profile = profileDisplay(p.beam.material)
      const qty = Math.max(1, Math.floor(p.quantity))
      const stock = formatStockCmNumberOnly(p.beam.lengthMm)
      const cuts = '' // drawn manually in didDrawCell
      const waste = formatStockCmNumberOnly(p.beam.wasteMm)
      return [profile, qty, stock, cuts, waste]
    })

    autoTable(pdf, {
      startY: cursorY + 1.2,
      rowPageBreak: 'avoid',
      styles: {
        font: 'Heebo',
        fontSize: 10,
        halign: 'right',
        cellPadding: 2.4,
        lineColor: [190, 190, 190],
        lineWidth: 0.2,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
        halign: 'right',
        fontStyle: 'normal',
      },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      head: [[toVisualRtl('סוג קורה'), toVisualRtl('כמות'), toVisualRtl('אורך מקור'), toVisualRtl('רשימת חיתוכים'), toVisualRtl('שארית')]],
      body: cuttingRows.map((r) => r.map(rtlCell)),
      columnStyles: {
        0: { cellWidth: 26, halign: 'right' },
        1: { cellWidth: 16, halign: 'center' },
        2: { cellWidth: 22, halign: 'left' },
        3: {
          cellWidth: pageW - marginX * 2 - (26 + 16 + 22 + 18),
          halign: 'left',
          cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
        },
        4: { cellWidth: 18, halign: 'left' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          data.cell.styles.fontStyle = 'bold'
        }
        if (data.section === 'body' && data.column.index === 3) {
          // We draw the "רשימת חיתוכים" cell manually in didDrawCell to get:
          // - stable LTR math ordering: length × qty
          // - extra spacing between groups
          // - bold length + lighter qty
          data.cell.text = ['']
        }
        if (data.section === 'body' && data.column.index === 4) {
          const rawRow = data.row.raw as PdfRow
          const m = String(rawRow[4] ?? '').match(/([0-9]+(?:\.[0-9]+)?)/)
          const cm = m ? Number(m[1]) : NaN
          if (Number.isFinite(cm) && cm > 10) {
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.textColor = [185, 28, 28]
          }
        }
      },
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 3) return
        const cuts = cuttingCutsByRow[data.row.index]
        if (!cuts || cuts.length === 0) return

        // Draw LTR segments inside RTL table cell.
        // Format: 90.0 × 5  |  40.0 × 2  |  15.5 × 1
        const doc = data.doc
        const padding = 3
        const x0 = data.cell.x + padding
        const y0 = data.cell.y + padding + 3.2
        const maxX = data.cell.x + data.cell.width - padding

        doc.setFontSize(10)
        let x = x0
        let y = y0

        const sep = '    |    '
        const extraSepGapMm = 1.5

        const drawToken = (text: string, fontStyle: 'normal' | 'bold', color: [number, number, number]) => {
          doc.setFont('Heebo', fontStyle)
          doc.setTextColor(color[0], color[1], color[2])
          const w = doc.getTextWidth(text)
          if (x + w > maxX) {
            x = x0
            y += 4.6
          }
          doc.text(text, x, y, { align: 'left' })
          x += w
        }

        for (let i = 0; i < cuts.length; i++) {
          const c = cuts[i]!
          if (i > 0) {
            drawToken(sep, 'normal', [100, 116, 139])
            x += extraSepGapMm
          }
          // length (bold)
          drawToken(c.length, 'bold', [15, 23, 42])
          drawToken(' × ', 'normal', [15, 23, 42])
          // qty (slightly lighter)
          drawToken(String(c.qty), 'normal', [55, 65, 81])
        }

        // restore default text color for subsequent cells
        doc.setTextColor(0)
        doc.setFont('Heebo', 'normal')
      },
    })

    cursorY = (pdf as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY
    cursorY += 10
  }

  downloadPdf(pdf, fileName)
}

