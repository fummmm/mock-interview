/**
 * 브라우저 내 Whisper STT (transformers.js)
 * 서버/API 키 불필요, 완전 무료, 사용량 무제한
 */

const FILLER_WORDS = ['음', '어', '그', '아', '에', '음음', '어어']
const SILENCE_THRESHOLD = 2.5 // 청크 간 2.5초 이상이면 침묵

let worker = null
let isModelReady = false

function getWorker() {
  if (!worker) {
    worker = new Worker(
      new URL('../workers/whisper.worker.js', import.meta.url),
      { type: 'module' }
    )
  }
  return worker
}

/**
 * 모델 사전 로딩 (첫 접속 시 호출, 캐시되면 이후 빠름)
 */
export function preloadModel(onProgress, onStatus) {
  return new Promise((resolve, reject) => {
    const w = getWorker()

    const handler = (e) => {
      const { type } = e.data
      if (type === 'download-progress' && onProgress) {
        onProgress(e.data)
      }
      if (type === 'status' && onStatus) {
        onStatus(e.data.message)
      }
      if (type === 'ready') {
        isModelReady = true
        w.removeEventListener('message', handler)
        resolve()
      }
      if (type === 'error') {
        w.removeEventListener('message', handler)
        reject(new Error(e.data.message))
      }
    }

    w.addEventListener('message', handler)
    w.postMessage({ type: 'load' })
  })
}

/**
 * 오디오 Blob을 텍스트로 변환
 */
export async function transcribeAudio(blob) {
  if (!isModelReady) {
    await preloadModel()
  }

  // WebM Blob → ArrayBuffer → Float32Array (PCM)
  const audioData = await blobToAudioData(blob)

  return new Promise((resolve, reject) => {
    const w = getWorker()

    const handler = (e) => {
      const { type } = e.data
      if (type === 'result') {
        w.removeEventListener('message', handler)
        const analysis = analyzeTranscript(e.data.text, e.data.chunks)
        resolve({
          transcript: e.data.text,
          chunks: e.data.chunks,
          ...analysis,
        })
      }
      if (type === 'error') {
        w.removeEventListener('message', handler)
        reject(new Error(e.data.message))
      }
    }

    w.addEventListener('message', handler)
    w.postMessage({ type: 'transcribe', audioData })
  })
}

/**
 * Blob → Float32Array (16kHz mono PCM)
 */
async function blobToAudioData(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  const channelData = audioBuffer.getChannelData(0) // mono
  audioCtx.close()
  return channelData
}

/**
 * 전사 결과에서 습관어/침묵 분석
 */
function analyzeTranscript(text, chunks) {
  let fillerWordCount = 0
  const fillerPositions = []
  const silencePositions = []

  // 습관어 감지 (텍스트 기반)
  const words = text.split(/\s+/).filter(Boolean)
  words.forEach((w) => {
    const cleaned = w.replace(/[.,!?。、]/g, '').trim()
    if (FILLER_WORDS.includes(cleaned)) {
      fillerWordCount++
      fillerPositions.push({ word: cleaned })
    }
  })

  // 침묵 감지 (청크 타임스탬프 기반)
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
