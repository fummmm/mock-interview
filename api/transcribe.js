/**
 * Vercel Serverless Function - Whisper STT 프록시
 * TODO: OpenAI API 키 확보 시 활성화
 * 클라이언트에서 /api/transcribe 로 호출
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return res.status(501).json({ error: 'OpenAI API key not configured. Currently using browser Web Speech API.' })
  }

  // TODO: FormData로 audio blob 수신 → Whisper API 전달
  // const formData = new FormData()
  // formData.append('file', req.body.audio)
  // formData.append('model', 'whisper-1')
  // formData.append('language', 'ko')
  // formData.append('timestamp_granularities[]', 'word')
  // formData.append('response_format', 'verbose_json')

  res.status(501).json({ error: 'Whisper integration pending' })
}
