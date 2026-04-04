import * as pdfjsLib from 'pdfjs-dist'
import Tesseract from 'tesseract.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

/**
 * PDF 파일에서 텍스트 추출 (텍스트 레이어 우선, 없으면 OCR 폴백)
 */
export async function extractTextFromPdf(file, maxChars = 5000) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  // 1차: 텍스트 레이어에서 추출
  const textPages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => item.str)
      .join(' ')
      .trim()
    textPages.push(text)
    if (textPages.join('\n').length > maxChars) break
  }

  const textResult = textPages.join('\n').trim()
  if (textResult.length > 100) return textResult.slice(0, maxChars)

  // 2차: 텍스트 레이어가 거의 없으면 OCR 시도 (최대 3페이지)
  console.log('[PDF] 텍스트 레이어 부족, OCR 시도...')
  const ocrPages = []
  const maxOcrPages = Math.min(pdf.numPages, 3)

  for (let i = 1; i <= maxOcrPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise

    const dataUrl = canvas.toDataURL('image/png')
    const {
      data: { text },
    } = await Tesseract.recognize(dataUrl, 'kor+eng')
    ocrPages.push(text.trim())

    if (ocrPages.join('\n').length > maxChars) break
  }

  return ocrPages.join('\n').slice(0, maxChars)
}
