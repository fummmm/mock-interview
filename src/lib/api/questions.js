/**
 * 질문 생성 관련 API - 이력서/포폴 기반, 채용공고 기반
 */
import { callOpenRouter, safeParseJSON, getTrackLabel } from './client'

/**
 * 이력서/포폴 기반 면접 질문 생성
 */
export async function generateDocumentQuestions(extractedText, track, count = 2) {
  if (!extractedText || extractedText.trim().length < 50) return []

  const trackLabel = getTrackLabel(track)

  try {
    // === 1단계: 프로젝트/경험 목록 추출 (중요도 포함) ===
    const extractContent = await callOpenRouter({
      model: 'anthropic/claude-sonnet-4',
      maxTokens: 2048,
      messages: [
        {
          role: 'system',
          content: `이력서와 포트폴리오에서 면접 질문을 만들 수 있는 항목들을 추출하세요.
각 항목에 출처, 항목명, 핵심 내용, 그리고 tier를 매겨주세요.

tier 기준:
- "major": 메인 프로젝트, 주요 경력, 인턴 경험, 상세하게 기술된 프로젝트 (구체적 기술스택/성과/수치가 있는 것)
- "minor": 간략히 언급된 경험, 교내 활동, 자격증, 한두 줄짜리 항목, 대외활동

반드시 JSON 배열로만 응답:
[
  { "source": "이력서 또는 포트폴리오", "name": "항목명", "detail": "핵심 내용 요약 (200자 이내)", "tier": "major 또는 minor" }
]

추출 대상:
- 프로젝트 (개인/팀/최종 프로젝트 등)
- 경력/인턴 경험
- 대외활동/동아리
- 수상/자격증 관련 경험
- 기타 면접에서 물어볼 만한 구체적 경험

최소 3개 이상 추출하세요.`,
        },
        { role: 'user', content: extractedText },
      ],
      jsonMode: true,
    })

    let items = safeParseJSON(extractContent, 'extractItems')
    if (!Array.isArray(items) || items.length === 0)
      items = [
        {
          source: '문서',
          name: '전체',
          detail: extractedText.slice(0, 500),
          tier: 'major',
        },
      ]

    // === 2단계: 가중 랜덤 선택 (major 60% / minor 40%) ===
    const majors = items.filter((i) => i.tier === 'major').sort(() => Math.random() - 0.5)
    const minors = items.filter((i) => i.tier !== 'major').sort(() => Math.random() - 0.5)
    const pickCount = Math.min(count + 1, items.length)

    let selected = []
    if (majors.length === 0) {
      selected = minors.slice(0, pickCount)
    } else if (minors.length === 0) {
      selected = majors.slice(0, pickCount)
    } else {
      const majorCount = Math.max(1, Math.round(pickCount * 0.6))
      const minorCount = pickCount - majorCount
      selected = [...majors.slice(0, majorCount), ...minors.slice(0, minorCount)]
    }
    selected = selected.sort(() => Math.random() - 0.5) // 순서 섞기

    // === 3단계: 선택된 항목 기반 질문 생성 ===
    const angles = [
      '의사결정 과정 (왜 이 기술/방법을 선택했는지)',
      '문제 해결 (어려웠던 점, 극복 방법)',
      '성장과 회고 (배운 점, 다시 한다면)',
      '가정/시나리오 (만약 ~하다면)',
      '확장적 사고 (다른 상황에 적용)',
      '깊이 있는 이해 (내부 동작, 구조)',
    ]
    const selectedAngle = angles[Math.floor(Math.random() * angles.length)]

    const itemsText = selected
      .map((item, i) => `[항목 ${i + 1}] (${item.source}) ${item.name}\n${item.detail}`)
      .join('\n\n')

    const content = await callOpenRouter({
      model: 'anthropic/claude-sonnet-4',
      temperature: 1.1,
      messages: [
        {
          role: 'system',
          content: `당신은 면접관입니다. 아래 항목들을 기반으로 면접 질문을 생성합니다.

## 질문 관점: **${selectedAngle}**

## 질문 유형 (섞어 사용)
- 의사결정형: "왜 A 대신 B를 선택했나요?"
- 가정형: "10배 규모로 확장해야 한다면?"
- 회고형: "다시 진행한다면 뭘 바꾸겠어요?"
- 깊이형: "내부적으로 어떤 구조로 동작하나요?"
- 비교형: "두 프로젝트의 가장 큰 차이는?"
- 시나리오형: "비슷한 문제가 생기면 어떻게 접근?"

## 규칙
- 각 항목에서 1개씩 질문 (항목당 1질문)
- 항목의 구체적 내용(프로젝트명, 수치, 기술)을 직접 인용
- "${trackLabel}" 직군 맥락에 맞게
- ${count}개 질문, 각각 다른 유형으로
- "~한 경험이 있나요?" 단순 패턴 금지

반드시 JSON 배열로만 응답:
[
  {
    "id": "doc-001",
    "text": "질문 내용",
    "category": "document",
    "difficulty": "intermediate",
    "keywords": ["키워드1"],
    "evaluationHints": "평가 포인트"
  }
]`,
        },
        { role: 'user', content: itemsText },
      ],
      jsonMode: true,
    })

    const questions = safeParseJSON(content, 'generateDocumentQuestions')
    return Array.isArray(questions) ? questions.slice(0, count) : []
  } catch (e) {
    return []
  }
}

/**
 * 채용 공고 기반 맞춤형 면접 질문 생성
 * companyName, position: 텍스트 입력
 * screenshots: base64 이미지 배열 (자격요건/우대사항 캡처)
 */
export async function generateJobPostingQuestions(
  { companyName, position, screenshots = [] },
  track,
  count = 2,
) {
  if (!companyName && !position && screenshots.length === 0) return []

  // 텍스트 입력만 있고 스크린샷이 없는 경우, 최소 의미 있는 입력인지 검증
  if (screenshots.length === 0) {
    const hasValidCompany = companyName && companyName.trim().length >= 2
    const hasValidPosition = position && position.trim().length >= 2
    if (!hasValidCompany || !hasValidPosition) return []
  }

  const trackLabel = getTrackLabel(track)

  // 비전 모델에 스크린샷 + 텍스트 정보를 함께 전달
  const userContent = []

  // 텍스트 정보
  let textInfo = ''
  if (companyName) textInfo += `[회사명] ${companyName}\n`
  if (position) textInfo += `[지원 직무] ${position}\n`
  if (textInfo) userContent.push({ type: 'text', text: textInfo })

  // 스크린샷 이미지
  for (const base64 of screenshots) {
    userContent.push({
      type: 'image_url',
      image_url: { url: base64 },
    })
  }

  if (screenshots.length > 0) {
    userContent.push({
      type: 'text',
      text: '위 이미지는 채용 공고의 자격요건/우대사항 캡처입니다. 이 내용을 분석하여 면접 질문을 생성해주세요.',
    })
  }

  const companyContext = companyName ? `${companyName}의` : '해당 회사의'
  const posContext = position || '이 포지션'

  // 매번 다른 스타일로 질문하도록 랜덤 선택
  const questionStyles = [
    '간결하고 직접적인 질문 (한 문장으로 핵심만)',
    '과정/프로세스를 묻는 질문 ("어떤 방식으로~", "프로세스를 설명해주세요")',
    '공고 키워드를 날카롭게 짚는 질문 ("OO 경험이 있다면 가장 어려웠던 부분은?")',
    '상황 기반 질문 ("만약 ~한 상황이라면 어떻게 하시겠어요?")',
  ]
  const selectedStyle = questionStyles[Math.floor(Math.random() * questionStyles.length)]

  const systemPrompt = `당신은 ${companyContext} 면접관입니다. 지원자가 ${posContext}에 적합한지 직접 검증하는 면접을 진행합니다.

## 이번 질문 스타일
**${selectedStyle}** 위주로 질문하세요.

## 좋은 질문 예시 (다양한 패턴)
- "고품질의 월드 레벨 구성을 경험해본 적 있으신가요?"
- "실시간 멀티플레이에서 네트워크 동기화를 어떤 방식으로 처리했는지 설명해주세요."
- "저희 프로젝트에서 성능 최적화가 중요한데, 본인만의 최적화 프로세스를 말씀해주세요."
- "라이브 서비스 운영 중 긴급 핫픽스를 해야 하는 상황이라면 어떻게 접근하시겠어요?"
- "데이터 기반 밸런싱을 해본 경험이 있다면, 가장 어려웠던 부분은 무엇이었나요?"
- "블루프린트로 구현한 시스템 중 가장 복잡했던 것을 설명해주세요."

## 나쁜 질문 (이런 패턴은 절대 금지)
- "저희는 OO 역량을 가진 사람을 찾고 있습니다. 관련 경험이 있으신가요?" (채용 공고 읽어주기)
- "저희 팀에서는 OO를 하고 있는데, 비슷한 경험이 있으신가요?" (매번 같은 패턴)
- "OO 경험을 요구하고 있는데..." (제3자 시점)
- 하나의 질문 안에 여러 질문을 넣지 마세요 (한 질문 = 하나의 핵심)

## 규칙
- 공고의 자격요건/기술스택에서 핵심 키워드를 뽑아서 질문에 자연스럽게 녹일 것
- "${trackLabel}" 직군 맥락에 맞게
- 질문마다 서로 다른 패턴/구조 사용 (반복 금지)
- 최대 ${count}개 (공고 빈약하면 2개)
- 이미지가 있으면 이미지 텍스트를 정확히 읽고 반영
- 주어는 "저희"(회사/팀) 또는 지원자 2인칭
- "저는~"으로 시작 금지

반드시 아래 JSON 배열 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력:
[
  {
    "id": "job-001",
    "text": "질문 내용 (공고 내용을 직접 인용)",
    "category": "job_posting",
    "difficulty": "intermediate",
    "keywords": ["키워드1", "키워드2"],
    "evaluationHints": "평가 포인트"
  }
]`

  try {
    // 스크린샷이 있으면 비전 모델 사용 (jsonMode 제외 - 비전+JSON 호환 문제)
    const useVision = screenshots.length > 0
    const content = await callOpenRouter({
      model: useVision ? 'openai/gpt-4o-mini' : 'anthropic/claude-sonnet-4',
      maxTokens: 4096,
      timeoutMs: 45000, // 공고 질문은 45초 타임아웃 (빠른 실패 → 기본 질문 폴백)
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: useVision ? userContent : userContent.map((c) => c.text).join('\n'),
        },
      ],
      jsonMode: !useVision,
    })

    // JSON 파싱 (비전 모델은 JSON 외 텍스트가 섞일 수 있으므로 추출)
    let parsed = null
    try {
      parsed = JSON.parse(content)
    } catch {
      const jsonMatch = content.match(/\[[\s\S]*\]/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    }

    const questions = Array.isArray(parsed) ? parsed : parsed?.questions || []
    return questions.slice(0, count)
  } catch (e) {
    console.warn('공고 질문 생성 실패:', e.message)
    return []
  }
}
