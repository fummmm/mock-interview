import { pipeline } from '@huggingface/transformers'

let transcriber = null

self.addEventListener('message', async (event) => {
  const { type, audioData } = event.data

  if (type === 'load') {
    try {
      self.postMessage({
        type: 'status',
        message: 'AI 음성 인식 모델을 준비하고 있습니다...',
      })

      transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
        progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.progress) {
            self.postMessage({
              type: 'download-progress',
              file: progress.file,
              progress: progress.progress,
              loaded: progress.loaded,
              total: progress.total,
            })
          }
          if (progress.status === 'done') {
            self.postMessage({ type: 'download-done', file: progress.file })
          }
        },
      })

      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: `모델 로딩 실패: ${err.message}`,
      })
    }
  }

  if (type === 'transcribe') {
    const requestId = event.data.requestId || ''
    if (!transcriber) {
      self.postMessage({
        type: 'error',
        requestId,
        message: '모델이 아직 로딩되지 않았습니다.',
      })
      return
    }

    try {
      const result = await transcriber(audioData, {
        language: 'ko',
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: 15,
        stride_length_s: 3,
      })

      // Whisper 진단 로그 (Worker)
      const chunks = result.chunks || []
      const lastTimestamp = chunks.length > 0 ? (chunks[chunks.length - 1].timestamp?.[1] || 0) : 0
      const rawText = result.text || ''
      console.log(`[Whisper 진단] 오디오: ${(audioData.length / 16000).toFixed(1)}초 | Whisper 끝: ${lastTimestamp.toFixed(1)}초 | 텍스트: ${rawText.length}자`)

      // 반복 환각 제거 + 짧은 환각 제거
      let text = result.text || ''
      text = removeRepetitions(text)
      text = removeShortHallucinations(text, audioData?.length || 0)

      self.postMessage({
        type: 'result',
        requestId,
        text,
        chunks,
      })
    } catch (err) {
      self.postMessage({
        type: 'error',
        requestId,
        message: `변환 실패: ${err.message}`,
      })
    }
  }
})

/**
 * Whisper 환각 제거
 * 침묵/무음 오디오에서 뉴스 앵커, 인사말 등을 만들어내는 문제 대응
 */
function removeShortHallucinations(text, audioSamples) {
  if (!text || !text.trim()) return ''
  const durationSec = audioSamples / 16000
  const trimmed = text.trim()
  const cleaned = trimmed.replace(/[.,!?~\s]/g, '')

  // 1) 짧은 오디오(10초 미만) + 짧은 텍스트(30자 미만): 환각 패턴 매칭
  if (durationSec < 10 && cleaned.length < 30) {
    const exactMatch = [
      '감사합니다',
      '네',
      '수고하셨습니다',
      '고맙습니다',
      '알겠습니다',
      '예',
      '시청해주셔서감사합니다',
      '구독과좋아요',
      '좋아요와구독',
    ]
    if (exactMatch.some((h) => cleaned === h)) return ''
  }

  // 2) 모든 길이: 전형적인 Whisper 한국어 환각 패턴 정규식
  const hallucinationPatterns = [
    /^MBC\s*뉴스/i,
    /^KBS\s*뉴스/i,
    /^SBS\s*뉴스/i,
    /^JTBC\s*뉴스/i,
    /^YTN\s*뉴스/i,
    /뉴스.{0,5}입니다/,
    /^안녕하세요[,.]?\s*.{1,5}입니다\.?$/,
    /^.{1,5}입니다\.?$/,
    /시청해\s*주셔서/,
    /구독.*좋아요/,
    /좋아요.*구독/,
    /^자막.*제공/i,
    /^번역.*자막/i,
    /^Thank you/i,
    /^Bye/i,
  ]
  if (hallucinationPatterns.some((p) => p.test(trimmed))) return ''

  return text
}

/**
 * 반복 환각 제거
 * Whisper가 같은 구절을 무한 반복 출력하는 버그 대응
 * 1) 정규식으로 동일 구절 3회+ 연속 반복을 1회로 축소
 * 2) 문장 단위에서 95% 이상 일치(거의 완전 동일)만 제거
 */
function removeRepetitions(text) {
  if (!text || text.length < 20) return text

  // 1단계: 동일 구절이 연속 3회 이상 반복되면 1회로 (Whisper 전형적 환각)
  // 예: "공동의 목표는 프로젝트에서 공동의 목표는 프로젝트에서 공동의 목표는 프로젝트에서" → 1회
  text = text.replace(/(.{8,}?)\1{2,}/g, '$1')

  // 2단계: 문장 단위 거의 동일한 반복만 제거 (95% 이상)
  const sentences = text.split(/(?<=[.!?。])\s*/)
  const deduped = []
  let prev = ''
  for (const s of sentences) {
    const trimmed = s.trim()
    if (!trimmed) continue
    if (prev && similarity(prev, trimmed) > 0.95) continue
    deduped.push(trimmed)
    prev = trimmed
  }

  return deduped.join(' ')
}

function similarity(a, b) {
  if (!a || !b) return 0
  const wordsA = a.split(/\s+/)
  const wordsB = b.split(/\s+/)
  const setA = new Set(wordsA)
  const setB = new Set(wordsB)
  let overlap = 0
  for (const w of setA) if (setB.has(w)) overlap++
  return overlap / Math.max(setA.size, setB.size)
}
