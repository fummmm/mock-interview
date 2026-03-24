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
    if (!transcriber) {
      self.postMessage({ type: 'error', message: '모델이 아직 로딩되지 않았습니다.' })
      return
    }

    try {
      self.postMessage({ type: 'status', message: '음성을 텍스트로 변환 중...' })

      const result = await transcriber(audioData, {
        language: 'ko',
        task: 'transcribe',
        return_timestamps: true, // sentence-level (word-level은 불안정)
        chunk_length_s: 30,
      })

      self.postMessage({
        type: 'result',
        text: result.text || '',
        chunks: result.chunks || [],
      })
    } catch (err) {
      self.postMessage({ type: 'error', message: `변환 실패: ${err.message}` })
    }
  }
})
