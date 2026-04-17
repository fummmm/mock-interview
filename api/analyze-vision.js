/**
 * Vercel Serverless Function - 비전 분석 프록시
 * 인증된 사용자만 호출 가능. 모델 화이트리스트 + max_tokens 상한 적용.
 */
import { verifyAuth, validateLLMRequest } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await verifyAuth(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const validation = validateLLMRequest(req.body)
  if (!validation.ok) return res.status(validation.status).json({ error: validation.error })

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY not configured')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Title': 'AI Mock Interview',
      },
      body: JSON.stringify(validation.body),
    })

    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error) {
    console.error('analyze-vision proxy error:', error)
    res.status(500).json({ error: 'Upstream request failed' })
  }
}
