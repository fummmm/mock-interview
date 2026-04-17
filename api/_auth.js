/**
 * 서버리스 함수용 공통 인증/검증 미들웨어
 * - Supabase JWT 검증 (비로그인 차단)
 * - 모델 화이트리스트 (고비용 모델 호출 차단)
 * - max_tokens 상한 (과금 폭증 방지)
 */

const ALLOWED_MODELS = new Set([
  'anthropic/claude-sonnet-4',
  'anthropic/claude-haiku-4-5',
  'anthropic/claude-haiku-4-5-20251001',
  'openai/gpt-4o-mini',
])

// 텍스트 분석(claude-sonnet-4)이 65536까지 필요. 비정상 남용만 차단하는 수준으로 여유 있게.
const MAX_TOKENS_CAP = 65536

/**
 * Supabase access token을 검증하여 user를 반환.
 * 실패 시 null.
 */
export async function verifyAuth(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  if (!token) return null

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase env vars missing on server')
    return null
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    })
    if (!res.ok) return null
    const user = await res.json()
    return user?.id ? user : null
  } catch {
    return null
  }
}

/**
 * 요청 body 검증: 모델 화이트리스트 + max_tokens 상한 + 필수 필드.
 * 통과 시 { ok: true, body }, 실패 시 { ok: false, status, error }.
 */
export function validateLLMRequest(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Invalid request body' }
  }
  if (!body.model || !ALLOWED_MODELS.has(body.model)) {
    return { ok: false, status: 400, error: 'Model not allowed' }
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, status: 400, error: 'Invalid messages' }
  }
  if (typeof body.max_tokens === 'number' && body.max_tokens > MAX_TOKENS_CAP) {
    body.max_tokens = MAX_TOKENS_CAP
  }
  return { ok: true, body }
}
