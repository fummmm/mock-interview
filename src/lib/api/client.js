/**
 * OpenRouter API 호출 헬퍼
 * 프로덕션: /api/openrouter 서버 프록시 경유 (Supabase access token 인증)
 * 개발(DEV): VITE_OPENROUTER_API_KEY 있으면 직접 호출 (로컬 편의)
 */
import { getEvaluators } from '../../data/evaluators'
import { supabase } from '../supabase'

const isDev = import.meta.env.DEV
const DIRECT_URL = 'https://openrouter.ai/api/v1/chat/completions'
const PROXY_URL = '/api/openrouter'

export async function callOpenRouter({
  model,
  messages,
  jsonMode = false,
  maxTokens = null,
  temperature = null,
  timeoutMs = 120000,
}) {
  const body = { model, messages }
  if (jsonMode) body.response_format = { type: 'json_object' }
  if (maxTokens) body.max_tokens = maxTokens
  if (temperature !== null) body.temperature = temperature

  const timeout = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined

  // 개발 환경: VITE_ 키로 직접 호출 (로컬 편의, 프로덕션에선 키가 없어야 함)
  const devKey = isDev ? import.meta.env.VITE_OPENROUTER_API_KEY : null
  if (devKey) {
    const res = await fetch(DIRECT_URL, {
      method: 'POST',
      signal: timeout,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'AI Mock Interview',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`OpenRouter error (${res.status}): ${await res.text()}`)
    const data = await res.json()
    return data.choices[0].message.content
  }

  // 프로덕션: Supabase 인증 토큰을 실어 서버 프록시 호출
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) throw new Error('로그인이 필요합니다.')

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    signal: timeout,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`API proxy error (${res.status})${errText ? ': ' + errText.slice(0, 200) : ''}`)
  }
  const data = await res.json()
  return data.choices[0].message.content
}

// 트랙별 전문용어 교정 사전
export const TRACK_TERMS = {
  spring: `
   - 스프링/스프링 부트: "스프릥/스프링부트" → "Spring/Spring Boot"
   - DI/IoC: "디아이/아이오시" → "DI/IoC"
   - JPA: "제이피에이/지피에이" → "JPA"
   - MyBatis: "마이바티스/마이바틱스" → "MyBatis"
   - REST API: "레스트/레스 API" → "REST API"
   - 트랜잭션: "트랜젝션/트렌젝션" → "트랜잭션"
   - 이진 탐색: "이제 탐색/이진탐색" → "이진 탐색"
   - BFS/DFS: "비에프에스/디에프에스/비프에스" → "BFS/DFS"
   - 메시지 큐: "메세지 큐/매시지큐" → "메시지 큐"
   - Redis: "레디스/래디스" → "Redis"
   - Docker: "도커/도카" → "Docker"
   - Kubernetes: "쿠버네티스/쿠버네디스" → "Kubernetes"
   - CI/CD: "시아이시디/씨아이씨디" → "CI/CD"
   - ORM: "오알엠/오아르엠" → "ORM"
   - SQL: "에스큐엘/시퀄" → "SQL"
   - 인덱스: "인덱서/인덱쓰" → "인덱스"
   - 정규화: "정규활/전규화" → "정규화"
   - 쿼리: "퀄리/퀘리" → "쿼리"
   - 리팩토링: "리팩토린/리팩토릭" → "리팩토링"
   - 엔드포인트: "엔포인트/엔드포인" → "엔드포인트"`,
  cs: `
   - 프로세스: "프로새스/프로쎄스" → "프로세스"
   - 스레드: "스래드/스렛" → "스레드"
   - 데드락: "데들락/데들록" → "데드락"
   - 컨텍스트 스위칭: "컨택스 스위칭/컨텍스위칭" → "컨텍스트 스위칭"
   - 가상 메모리: "가상 매모리/가상메모래" → "가상 메모리"
   - 이진 탐색: "이제 탐색/이진탐색" → "이진 탐색"
   - 해시 테이블: "해쉬 테이블/해시테이불" → "해시 테이블"
   - 링크드 리스트: "링크드리스트/링크리스트" → "연결 리스트"
   - Big-O: "빅오/빅오표기법" → "Big-O"
   - BFS/DFS: "비에프에스/디에프에스" → "BFS/DFS"
   - TCP/UDP: "티씨피/유디피" → "TCP/UDP"
   - ACID: "에이시드/아시드" → "ACID"
   - SOLID: "솔리드/소리드" → "SOLID"
   - OOP: "오오피/오오프" → "OOP"
   - 캡슐화: "캡슈화/캡슐활" → "캡슐화"
   - 다형성: "다형선/다형정" → "다형성"`,
  unity: `
   - MonoBehaviour: "모노비헤이비어/모노비해" → "MonoBehaviour"
   - Coroutine: "코루틴/코루팀" → "Coroutine"
   - Prefab: "프리팹/프리뱁" → "Prefab"
   - ScriptableObject: "스크립터블오브젝/스크립터불" → "ScriptableObject"
   - Rigidbody: "리지드바디/리짓바디" → "Rigidbody"
   - Collider: "콜라이더/콜리더" → "Collider"
   - NavMesh: "네브메쉬/내브매쉬" → "NavMesh"
   - Addressable: "어드레서블/아드레서불" → "Addressable"
   - 셰이더: "쉐이더/세이더" → "셰이더"
   - Animator: "애니메이터/아니메이터" → "Animator"`,
  unreal: `
   - 블루프린트: "블류프린트/블루프런트" → "블루프린트"
   - 언리얼: "얼리얼/언렬" → "언리얼"
   - 나이아가라: "니아가라/나이아갈라" → "나이아가라"
   - 머티리얼: "매티리얼/메테리얼" → "머티리얼"
   - 레벨 스트리밍: "레블 스트리밍/레벨스트리밈" → "레벨 스트리밍"
   - Tick: "틱/틱함수" → "Tick"
   - 캐릭터 무브먼트: "캐릭터무브먼/캐릭터 무분먼트" → "캐릭터 무브먼트"`,
  pm: `
   - KPI: "케이피아이/키피아이" → "KPI"
   - OKR: "오케이알/오케알" → "OKR"
   - 로드맵: "로드맵/로드뱁" → "로드맵"
   - 백로그: "백로그/백록" → "백로그"
   - 스프린트: "스프린트/스프린" → "스프린트"
   - 스크럼: "스크럼/스크름" → "스크럼"
   - 유저 스토리: "유져 스토리/유저스토래" → "유저 스토리"
   - MVP: "엠브이피/엠비피" → "MVP"
   - A/B 테스트: "에이비 테스트/에이비테스" → "A/B 테스트"`,
  design: `
   - 레벨 디자인: "레블 디자인/레벨디자일" → "레벨 디자인"
   - 밸런싱: "벨런싱/밸런씽" → "밸런싱"
   - 재화 시스템: "재활 시스템/재화시스텝" → "재화 시스템"
   - 인게임: "인계임/인겜" → "인게임"
   - 온보딩: "온볼딩/온보딩" → "온보딩"
   - 리텐션: "리텐전/리텐숀" → "리텐션"
   - 모네타이제이션: "모네타이제이숀/모네타이즈" → "모네타이제이션"`,
}

/**
 * LLM 응답에서 JSON을 안전하게 추출
 * 마크다운 코드블록(```json ... ```)이 감싸져 있는 경우도 처리
 */
export function safeParseJSON(content, label) {
  if (!content) throw new Error(`${label}: 응답이 비어있습니다`)

  // 1차: 그대로 파싱
  try {
    return JSON.parse(content)
  } catch (e) {
    // 2차: 마크다운 코드블록 제거 후 파싱
    const cleaned = content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()
    try {
      return JSON.parse(cleaned)
    } catch (e2) {
      // 3차: JSON 부분만 추출 (첫 { ~ 마지막 })
      const match = content.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          return JSON.parse(match[0])
        } catch (e3) {
          // 4차: 잘린 JSON 복구 시도 (닫는 괄호 추가)
          let truncated = match[0]
          const opens = (truncated.match(/\{/g) || []).length
          const closes = (truncated.match(/\}/g) || []).length
          const brOpens = (truncated.match(/\[/g) || []).length
          const brCloses = (truncated.match(/\]/g) || []).length
          // 마지막 유효한 값 뒤에서 자르고 괄호 닫기
          truncated = truncated.replace(/,\s*$/, '')
          for (let i = 0; i < brOpens - brCloses; i++) truncated += ']'
          for (let i = 0; i < opens - closes; i++) truncated += '}'
          try {
            return JSON.parse(truncated)
          } catch (e4) {
            /* 최종 실패 */
          }
        }
      }
      console.error(
        `[${label}] JSON 파싱 실패. 원본 길이: ${content.length}자, 앞 200자:`,
        content.slice(0, 200),
      )
      throw new Error(`${label}: JSON 파싱 실패 (응답 ${content.length}자)`)
    }
  }
}

export function getTrackLabel(track) {
  const labels = {
    behavioral: '인성면접',
    unity: 'Unity 개발',
    unreal: 'Unreal Engine 개발',
    pm: 'PM/기획',
    design: '게임기획',
    spring: 'Spring 백엔드 개발',
    cs: 'CS 기초 지식',
  }
  return labels[track] || '종합'
}

export function getEvaluatorConfig(track, trackLabel, companySize = 'medium') {
  const feedbackTemplate = `"questionFeedbacks": [
        {
          "questionIndex": 0,
          "scores": { "relevance": 0, "structure": 0, "keywords": 0, "specificity": 0 },
          "comment": "이 질문에 대한 상세 코멘트 (4~5문장: 잘한 점, 부족한 점, 구체적 개선 방향을 모두 포함)",
          "problemPhrases": [
            { "text": "문제 구절 (원문 그대로)", "reason": "이유", "severity": "warning" }
          ]
        }
      ],
      "overallComment": "면접 전체에 대한 상세 총평 (5~6문장: 준비 수준, 강점 패턴, 반복 약점, 다음 연습 포인트 포함)",
      "strengths": ["강점1 (답변 내용을 인용하며 구체적으로)", "강점2", "강점3"],
      "improvements": ["개선점1 (어떻게 고치면 좋은지 방법까지)", "개선점2", "개선점3"],
      "pass": true`

  const evaluators = getEvaluators(track, companySize)

  const prompt = evaluators
    .map(
      (ev, i) =>
        `${i + 1}. **${ev.name}** (${ev.role})
   - ${ev.focus} 위주 평가
   - ${ev.prompt}`,
    )
    .join('\n\n')

  const jsonExample = evaluators
    .map(
      (ev) =>
        `    {
      "id": "${ev.id}",
      "name": "${ev.name}",
      "role": "${ev.role}",
      ${feedbackTemplate}
    }`,
    )
    .join(',\n')

  return { prompt, jsonExample }
}
