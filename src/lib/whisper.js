/**
 * 브라우저 내 Whisper STT (transformers.js)
 * 서버/API 키 불필요, 완전 무료, 사용량 무제한
 *
 * 1차: Web Worker에서 실행 (UI 블로킹 방지)
 * 2차: Worker 실패 시 메인 스레드 폴백
 */

const FILLER_WORDS = ['음', '어', '그', '아', '에', '음음', '어어']
const SILENCE_THRESHOLD = 2.5

let worker = null
let isModelReady = false
let useMainThread = false

// 순차 처리 큐 (동시 요청 시 답변 밀림 방지)
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

/**
 * 모델 사전 로딩
 */
export async function preloadModel(onProgress, onStatus) {
  const w = getWorker()

  if (!w || useMainThread) {
    // 메인 스레드 폴백
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

  // Worker 방식
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      w.removeEventListener('message', handler)
      console.warn('Worker model load timeout, falling back to main thread')
      useMainThread = true
      worker = null
      preloadModel(onProgress, onStatus).then(resolve).catch(reject)
    }, 120000) // 2분 타임아웃

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
        // Worker 실패 → 메인 스레드 폴백
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

/**
 * 오디오 Blob → 텍스트 변환 (큐로 순차 처리 보장)
 */
export function transcribeAudio(blob) {
  // 큐에 추가: 이전 작업이 끝난 후에 실행
  const task = transcribeQueue
    .then(() => _transcribeAudio(blob))
    .catch((e) => {
      console.warn('[Whisper] 변환 실패:', e.message)
      throw e
    })
  transcribeQueue = task.catch(() => {}) // 에러가 큐를 끊지 않게
  return task
}

async function _transcribeAudio(blob) {
  if (!isModelReady) await preloadModel()

  const audioData = await blobToAudioData(blob)

  if (useMainThread || !worker) {
    // 메인 스레드 폴백
    const pipe = globalThis.__whisperPipeline
    if (!pipe) throw new Error('모델이 로딩되지 않았습니다.')
    const result = await pipe(audioData, {
      language: 'ko',
      task: 'transcribe',
      return_timestamps: true,
      chunk_length_s: 60,
      stride_length_s: 5,
    })
    // Whisper 진단 로그 (메인 스레드 폴백)
    const chunks = result.chunks || []
    const lastTimestamp = chunks.length > 0 ? (chunks[chunks.length - 1].timestamp?.[1] || 0) : 0
    const text0 = result.text || ''
    console.log(`[Whisper 진단] 오디오: ${(audioData.length / 16000).toFixed(1)}초 | Whisper 끝: ${lastTimestamp.toFixed(1)}초 | 텍스트: ${text0.length}자`)
    // 메인 스레드에서도 환각 필터 적용
    let text = result.text || ''
    text = _removeMainThreadHallucinations(text, audioData?.length || 0)
    return {
      transcript: text,
      chunks: result.chunks || [],
      ...analyzeTranscript(text, result.chunks),
    }
  }

  // Worker 방식 (requestId로 결과 매칭, 동시 요청 충돌 방지)
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.removeEventListener('message', handler)
      reject(new Error('음성 변환 시간 초과'))
    }, 180000)

    const handler = (e) => {
      // 내 요청의 응답만 처리
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

// 메인 스레드용 환각 필터 (Worker 내장 필터와 동일 로직)
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
  // 반복 환각 제거
  text = text.replace(/(.{8,}?)\1{2,}/g, '$1')
  return text
}

async function blobToAudioData(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 16000,
  })
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  console.log(`[Whisper 진단] Blob 크기: ${blob.size} bytes | 디코딩 오디오: ${audioBuffer.duration.toFixed(1)}초`)
  const channelData = audioBuffer.getChannelData(0)
  audioCtx.close()
  return channelData
}

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

export function isModelLoaded() {
  return isModelReady
}
