/**
 * Vercel Serverless Function - OpenRouter 통합 프록시
 * 모든 LLM 호출이 이 엔드포인트를 경유
 * API 키는 Vercel 환경변수에만 보관 (클라이언트 노출 없음)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured on server' })
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer':
          req.headers.referer || req.headers.origin || 'https://mock-interview.vercel.app',
        'X-Title': 'AI Mock Interview',
      },
      body: JSON.stringify(req.body),
    })

    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error) {
    console.error('OpenRouter proxy error:', error)
    res.status(500).json({ error: error.message })
  }
}
