import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

/**
 * PDF 파일에서 텍스트를 추출
 * @param {File} file - PDF File 객체
 * @param {number} maxChars - 최대 추출 글자 수
 * @returns {Promise<string>} 추출된 텍스트
 */
export async function extractTextFromPdf(file, maxChars = 5000) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item) => item.str).join(' ')
    pages.push(text)

    // 조기 종료: 이미 충분한 텍스트
    if (pages.join('\n').length > maxChars) break
  }

  return pages.join('\n').slice(0, maxChars)
}
