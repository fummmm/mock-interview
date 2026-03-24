/**
 * Groq Whisper API - 음성→텍스트 변환
 * 무료, word_timestamps 지원, 한국어 정확도 높음
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'

const FILLER_WORDS = ['음', '어', '그', '아', '에', '음음', '어어']
const SILENCE_THRESHOLD = 2.5 // 단어 간 2.5초 이상이면 침묵

export async function transcribeAudio(blob) {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY
  if (!apiKey) throw new Error('VITE_GROQ_API_KEY가 설정되지 않았습니다.')

  const formData = new FormData()
  formData.append('file', blob, 'recording.webm')
  formData.append('model', 'whisper-large-v3')
  formData.append('language', 'ko')
  formData.append('response_format', 'verbose_json')
  formData.append('timestamp_granularities[]', 'word')

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Groq Whisper error (${res.status}): ${error}`)
  }

  const data = await res.json()

  // word timestamps에서 습관어/침묵 분석
  const words = data.words || []
  const analysis = analyzeFromTimestamps(words)

  return {
    transcript: data.text || '',
    words,
    duration: data.duration || 0,
    ...analysis,
  }
}

function analyzeFromTimestamps(words) {
  let fillerWordCount = 0
  let silenceCount = 0
  const fillerPositions = []
  const silencePositions = []

  words.forEach((w, i) => {
    // 습관어 감지
    const cleaned = w.word.trim().replace(/[.,!?]/g, '')
    if (FILLER_WORDS.includes(cleaned)) {
      fillerWordCount++
      fillerPositions.push({ word: cleaned, time: w.start })
    }

    // 침묵 감지 (이전 단어 끝 ~ 현재 단어 시작)
    if (i > 0) {
      const gap = w.start - words[i - 1].end
      if (gap >= SILENCE_THRESHOLD) {
        silenceCount++
        silencePositions.push({ start: words[i - 1].end, duration: gap })
      }
    }
  })

  return { fillerWordCount, silenceCount, fillerPositions, silencePositions }
}
