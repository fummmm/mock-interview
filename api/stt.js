/**
 * Vercel Serverless Function - STT(Groq Whisper) 프록시
 * 인증된 사용자만 호출 가능. 오디오 Blob을 Groq로 전달, 응답 그대로 반환.
 * 요청은 multipart/form-data이며, 서버가 raw body를 그대로 forward.
 */
import { verifyAuth } from './_auth.js'

// multipart 파싱을 Vercel 기본 파서에 맡기지 않고 raw body로 처리
export const config = {
  maxDuration: 120,
  api: { bodyParser: false },
}

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await verifyAuth(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error('GROQ_API_KEY not configured')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const contentType = req.headers['content-type']
  if (!contentType || !contentType.startsWith('multipart/form-data')) {
    return res.status(400).json({ error: 'Invalid content type' })
  }

  try {
    const rawBody = await readRawBody(req)

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': contentType, // multipart boundary 보존
      },
      body: rawBody,
    })

    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error) {
    console.error('STT proxy error:', error)
    res.status(500).json({ error: 'Upstream request failed' })
  }
}
