import { pipeline } from '@huggingface/transformers'

let transcriber = null

self.addEventListener('message', async (event) => {
  const { type, audioData } = event.data

  if (type === 'load') {
    try {
      self.postMessage({ type: 'status', message: 'AI 음성 인식 모델을 준비하고 있습니다...' })

      transcriber = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-base',
        {
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
        }
      )

      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({ type: 'error', message: `모델 로딩 실패: ${err.message}` })
    }
  }

  if (type === 'transcribe') {
    const requestId = event.data.requestId || ''
    if (!transcriber) {
      self.postMessage({ type: 'error', requestId, message: '모델이 아직 로딩되지 않았습니다.' })
      return
    }

    try {
      const result = await transcriber(audioData, {
        language: 'ko',
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: 30,
      })

      // 반복 환각 제거 + 짧은 환각 제거
      let text = result.text || ''
      text = removeRepetitions(text)
      text = removeShortHallucinations(text, audioData?.length || 0)

      self.postMessage({
        type: 'result',
        requestId,
        text,
        chunks: result.chunks || [],
      })
    } catch (err) {
      self.postMessage({ type: 'error', requestId, message: `변환 실패: ${err.message}` })
    }
  }
})

/**
 * 짧은 오디오에서 Whisper 환각 제거
 * 침묵인데 "감사합니다", "네", "수고하셨습니다" 등을 만들어내는 문제 대응
 */
function removeShortHallucinations(text, audioSamples) {
  if (!text || !text.trim()) return ''
  // 16kHz 기준 3초 = 48000 샘플
  const durationSec = audioSamples / 16000
  const trimmed = text.trim()
  // 5초 미만 오디오에서 10자 이하 텍스트는 환각일 가능성 높음
  if (durationSec < 5 && trimmed.length < 15) {
    const hallucinations = ['감사합니다', '네', '수고하셨습니다', '고맙습니다', '알겠습니다', '예']
    for (const h of hallucinations) {
      if (trimmed.replace(/[.,!?]/g, '').trim() === h) return ''
    }
  }
  return text
}

/**
 * 반복 환각 제거
 * Whisper가 같은 구절을 무한 반복 출력하는 버그 대응
 * 5단어 이상의 구절이 연속 2회 이상 반복되면 1회만 남김
 */
function removeRepetitions(text) {
  if (!text || text.length < 20) return text

  // 문장 단위 반복 제거
  const sentences = text.split(/(?<=[.!?。])\s*/)
  const deduped = []
  let prev = ''
  for (const s of sentences) {
    const trimmed = s.trim()
    if (!trimmed) continue
    // 이전 문장과 80% 이상 겹치면 스킵
    if (prev && similarity(prev, trimmed) > 0.8) continue
    deduped.push(trimmed)
    prev = trimmed
  }

  return deduped.join(' ')
}

function similarity(a, b) {
  if (!a || !b) return 0
  const setA = new Set(a.split(/\s+/))
  const setB = new Set(b.split(/\s+/))
  let overlap = 0
  for (const w of setA) if (setB.has(w)) overlap++
  return overlap / Math.max(setA.size, setB.size)
}
