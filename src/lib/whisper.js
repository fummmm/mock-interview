/**
 * STT (Speech-to-Text) 모듈
 *
 * 우선순위:
 * 1. VITE_GROQ_API_KEY → Groq Whisper large-v3-turbo (서버, 빠름, 정확)
 * 2. VITE_OPENAI_API_KEY → OpenAI Whisper API (서버, 정확)
 * 3. 둘 다 없으면 → 브라우저 내 Whisper base (레거시 폴백)
 */

const FILLER_WORDS = ['음', '어', '그', '아', '에', '음음', '어어']
const SILENCE_THRESHOLD = 2.5

// ═══════════════════════════════════════════════════
//  서버 STT (Groq / OpenAI — 동일한 Whisper API 포맷)
// ═══════════════════════════════════════════════════

const STT_PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/audio/transcriptions',
    model: 'whisper-large-v3-turbo',
    key: import.meta.env.VITE_GROQ_API_KEY,
  },
  openai: {
    url: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'whisper-1',
    key: import.meta.env.VITE_OPENAI_API_KEY,
  },
}

function getServerProvider() {
  if (STT_PROVIDERS.groq.key) return { name: 'groq', ...STT_PROVIDERS.groq }
  if (STT_PROVIDERS.openai.key) return { name: 'openai', ...STT_PROVIDERS.openai }
  return null
}

const serverProvider = getServerProvider()

async function _transcribeServer(blob) {
  const formData = new FormData()
  formData.append('file', blob, 'audio.webm')
  formData.append('model', serverProvider.model)
  formData.append('language', 'ko')
  formData.append('response_format', 'verbose_json')

  const res = await fetch(serverProvider.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serverProvider.key}` },
    body: formData,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`[${serverProvider.name}] STT 실패 (${res.status}): ${errText}`)
  }

  const data = await res.json()
  const text = data.text || ''

  // segments → chunks 변환 (브라우저 Whisper 형식과 동일하게)
  const chunks = (data.segments || []).map((seg) => ({
    timestamp: [seg.start, seg.end],
    text: seg.text,
  }))

  const lastEnd = chunks.length > 0 ? chunks[chunks.length - 1].timestamp[1] : 0
  console.log(
    `[STT 진단] ${serverProvider.name} | 오디오: ${(data.duration || 0).toFixed(1)}초 | 끝: ${lastEnd.toFixed(1)}초 | 텍스트: ${text.length}자`,
  )

  return {
    transcript: text,
    chunks,
    ...analyzeTranscript(text, chunks),
  }
}

// ═══════════════════════════════════════════════════
//  브라우저 Whisper (레거시 폴백)
//  서버 API 키가 없을 때만 사용
// ═══════════════════════════════════════════════════

let worker = null
let isModelReady = false
let useMainThread = false
let transcribeQueue = Promise.resolve()

function getWorker() {
  if (!worker && !useMainThread) {
    try {
      worker = new Worker(new URL('../workers/whisper.worker.js', import.meta.url), {
        type: 'module',
      })
      worker.onerror = (e) => {
        console.warn('Whisper Worker error:', e.message)
        useMainThread = true
        worker = null
      }
    } catch (e) {
      console.warn('Worker creation failed, using main thread:', e.message)
      useMainThread = true
    }
  }
  return worker
}

async function _transcribeBrowser(blob) {
  if (!isModelReady) await preloadModel()

  const audioData = await blobToAudioData(blob)

  if (useMainThread || !worker) {
    const pipe = globalThis.__whisperPipeline
    if (!pipe) throw new Error('모델이 로딩되지 않았습니다.')
    const result = await pipe(audioData, {
      language: 'ko',
      task: 'transcribe',
      return_timestamps: true,
      chunk_length_s: 15,
      stride_length_s: 3,
    })
    const chunks = result.chunks || []
    const lastTimestamp =
      chunks.length > 0 ? chunks[chunks.length - 1].timestamp?.[1] || 0 : 0
    const text0 = result.text || ''
    console.log(
      `[STT 진단] browser | 오디오: ${(audioData.length / 16000).toFixed(1)}초 | Whisper 끝: ${lastTimestamp.toFixed(1)}초 | 텍스트: ${text0.length}자`,
    )
    let text = result.text || ''
    text = _removeMainThreadHallucinations(text, audioData?.length || 0)
    return {
      transcript: text,
      chunks: result.chunks || [],
      ...analyzeTranscript(text, result.chunks),
    }
  }

  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.removeEventListener('message', handler)
      reject(new Error('음성 변환 시간 초과'))
    }, 180000)

    const handler = (e) => {
      if (e.data.requestId && e.data.requestId !== requestId) return

      if (e.data.type === 'result') {
        clearTimeout(timeout)
        worker.removeEventListener('message', handler)
        const analysis = analyzeTranscript(e.data.text, e.data.chunks)
        resolve({
          transcript: e.data.text,
          chunks: e.data.chunks,
          ...analysis,
        })
      }
      if (e.data.type === 'error') {
        clearTimeout(timeout)
        worker.removeEventListener('message', handler)
        reject(new Error(e.data.message))
      }
    }

    worker.addEventListener('message', handler)
    worker.postMessage({ type: 'transcribe', audioData, requestId })
  })
}

function _removeMainThreadHallucinations(text, audioSamples) {
  if (!text || !text.trim()) return ''
  const trimmed = text.trim()
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
  text = text.replace(/(.{8,}?)\1{2,}/g, '$1')
  return text
}

async function blobToAudioData(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 16000,
  })
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  console.log(
    `[STT 진단] Blob 크기: ${blob.size} bytes | 디코딩 오디오: ${audioBuffer.duration.toFixed(1)}초`,
  )
  const channelData = audioBuffer.getChannelData(0)
  audioCtx.close()
  return channelData
}

// ═══════════════════════════════════════════════════
//  공통 유틸리티
// ═══════════════════════════════════════════════════

function analyzeTranscript(text, chunks) {
  let fillerWordCount = 0
  const fillerPositions = []
  const silencePositions = []

  const words = (text || '').split(/\s+/).filter(Boolean)
  words.forEach((w) => {
    const cleaned = w.replace(/[.,!?。、]/g, '').trim()
    if (FILLER_WORDS.includes(cleaned)) {
      fillerWordCount++
      fillerPositions.push({ word: cleaned })
    }
  })

  let silenceCount = 0
  if (chunks && chunks.length > 1) {
    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = chunks[i - 1].timestamp?.[1] || 0
      const currStart = chunks[i].timestamp?.[0] || 0
      const gap = currStart - prevEnd
      if (gap >= SILENCE_THRESHOLD) {
        silenceCount++
        silencePositions.push({ start: prevEnd, duration: gap })
      }
    }
  }

  return { fillerWordCount, silenceCount, fillerPositions, silencePositions }
}

// ═══════════════════════════════════════════════════
//  Public API (기존 인터페이스 100% 호환)
// ═══════════════════════════════════════════════════

/**
 * 오디오 Blob → 텍스트 변환
 * 서버 API 키가 있으면 서버 STT, 없으면 브라우저 Whisper
 */
export function transcribeAudio(blob) {
  // 서버 STT: 큐 불필요 (서버가 동시 처리)
  if (serverProvider) {
    return _transcribeServer(blob)
  }

  // 브라우저 Whisper: 큐로 순차 처리
  const task = transcribeQueue
    .then(() => _transcribeBrowser(blob))
    .catch((e) => {
      console.warn('[Whisper] 변환 실패:', e.message)
      throw e
    })
  transcribeQueue = task.catch(() => {})
  return task
}

/**
 * 모델 사전 로딩
 * 서버 STT 사용 시 로딩 불필요 → 즉시 완료
 */
export async function preloadModel(onProgress, onStatus) {
  if (serverProvider) {
    console.log(`[STT] 서버 모드: ${serverProvider.name} (${serverProvider.model})`)
    isModelReady = true
    return
  }

  // 브라우저 Whisper 모델 로딩 (레거시)
  const w = getWorker()

  if (!w || useMainThread) {
    onStatus?.('음성 인식 모델 준비 중 (메인 스레드)...')
    const { pipeline } = await import('@huggingface/transformers')
    globalThis.__whisperPipeline = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-base',
      {
        progress_callback: (p) => {
          if (p.status === 'progress' && p.progress) onProgress?.(p)
          if (p.status === 'initiate') onStatus?.(`다운로드 중: ${p.file}`)
        },
      },
    )
    isModelReady = true
    return
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      w.removeEventListener('message', handler)
      console.warn('Worker model load timeout, falling back to main thread')
      useMainThread = true
      worker = null
      preloadModel(onProgress, onStatus).then(resolve).catch(reject)
    }, 120000)

    const handler = (e) => {
      const { type } = e.data
      if (type === 'download-progress') onProgress?.(e.data)
      if (type === 'status') onStatus?.(e.data.message)
      if (type === 'ready') {
        clearTimeout(timeout)
        isModelReady = true
        w.removeEventListener('message', handler)
        resolve()
      }
      if (type === 'error') {
        clearTimeout(timeout)
        w.removeEventListener('message', handler)
        console.warn('Worker load failed, falling back:', e.data.message)
        useMainThread = true
        worker = null
        preloadModel(onProgress, onStatus).then(resolve).catch(reject)
      }
    }

    w.addEventListener('message', handler)
    w.postMessage({ type: 'load' })
  })
}

export function isModelLoaded() {
  return serverProvider ? true : isModelReady
}
