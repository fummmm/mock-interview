/**
 * OpenRouter API 호출 헬퍼
 * 배포: /api/openrouter 서버 프록시 경유 (API 키 서버에만 보관)
 * 개발: VITE_OPENROUTER_API_KEY 있으면 직접 호출 (폴백)
 */
import { getEvaluators } from '../data/evaluators'

const isDev = import.meta.env.DEV
const DIRECT_URL = 'https://openrouter.ai/api/v1/chat/completions'
const PROXY_URL = '/api/openrouter'

async function callOpenRouter({ model, messages, jsonMode = false }) {
  const body = { model, messages }
  if (jsonMode) body.response_format = { type: 'json_object' }

  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  const timeout = AbortSignal.timeout ? AbortSignal.timeout(120000) : undefined // 2분 타임아웃

  // VITE_ 키가 있으면 직접 호출 (개발/배포 모두)
  // Vercel Serverless는 10초 타임아웃이라 LLM 호출에 부적합
  if (apiKey) {
    const res = await fetch(DIRECT_URL, {
      method: 'POST',
      signal: timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'AI Mock Interview',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`OpenRouter error (${res.status}): ${await res.text()}`)
    const data = await res.json()
    return data.choices[0].message.content
  }

  // 폴백: 서버 프록시
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    signal: timeout,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`API proxy error (${res.status}): ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content
}

/**
 * STT 텍스트 교정 - 음성 인식 오류를 문맥에 맞게 보정
 * Whisper base의 부정확한 한국어를 LLM이 교정
 */
export async function correctTranscript(rawTranscript, questionText) {
  if (!rawTranscript || rawTranscript.trim().length < 5) return rawTranscript || ''

  const content = await callOpenRouter({
    model: 'anthropic/claude-sonnet-4',
    messages: [
      {
        role: 'system',
        content: `당신은 한국어 음성 인식(STT) 교정 전문가입니다.
Whisper 모델이 한국어를 인식한 결과를 교정합니다. 이 텍스트는 취업 면접 답변입니다.

## 적극적으로 교정해야 할 것
1. **발음 유사 오인식**: STT가 발음이 비슷한 다른 단어로 잘못 인식한 것을 문맥에 맞게 교정
   - 예: "생물" → "신입", "월요소" → "어릴 때부터", "이력이" → "이런 게", "과차" → "과정"
   - 예: "해갖고" 가 "해 같고"로 인식된 경우 → "해갖고"로 복원
   - 예: 고유명사 오인식 "유니트" → "유니티", "언리얼" → "언리얼"(정상)
2. **단어 경계 오류**: 띄어쓰기가 잘못되어 의미가 달라진 것 교정
   - 예: "게임기 획" → "게임기획", "팀프로 젝트" → "팀 프로젝트"
3. **조사 오류**: STT가 잘못 붙이거나 누락한 조사 교정
   - 예: "게임을를" → "게임을", "저는은" → "저는"
4. **문장 부호**: 문장 끝에 마침표, 자연스러운 쉼표. 과도하지 않게.
5. **외래어/전문용어**: 면접 맥락에서 자주 쓰이는 용어가 잘못 인식된 경우 교정
   - 예: "C 샵" → "C#", "레이 캐스트" → "레이캐스트"
6. **면접/교육 도메인 특화 오인식** (Whisper가 자주 틀리는 실제 패턴):
   - 회사명: "팀스파타/팀스파라타/팀스프라타/팀 스파트" → "팀스파르타"
   - 교육: "커리클롬/커리킬로" → "커리큘럼", "수방생/수사생/수학생" → "수강생"
   - 직무: "기회 매니저/기획레니저" → "기획 매니저", "운영메이저" → "운영매니저"
   - 교육: "당기심/당기심의" → "부트캠프", "플로트" → "부트캠프", "채우시장" → "취업시장"
   - HR: "고객강원" → "고객관리", "체형 공고" → "채용 공고", "렌저업" → "면접"
   - 기타: "기종공사" → "비전공자", "중독폭" → "중도포기율", "이탈리" → "이탈률"
   - 장소: "공유업비스/공유피스" → "공유오피스"
   - 발음유사: "해외할" → "협업할", "이랄" → "일할", "동녀" → "동료"
   - 발음유사: "속통" → "소통", "계단하고" → "깨달았고", "홍당" → "성장"
   - 교육: "교육군형" → "교육운영", "단영간" → "다년간", "내배운 캠프/내일병 캠프" → "내일배움캠프/부트캠프"
   - 직무: "입하실" → "임하실", "명령" → "경력/경험", "발탄" → "바탕"
   - 발음유사: "다녀는" → "원활한", "언급을 찾을" → "문제가", "일정맵만" → "일정에 맞춰서"
   - 발음유사: "배타적인 퇴도" → "겸손한 태도", "면적/렌접" → "면접", "인제" → "인재", "그위욕은형" → "교육운영"
   - 게임업계: "플래스토어" → "플레이스토어", "액스토어" → "앱스토어", "엠매직" → "앱매직"
   - 게임업계: "하이퍼케주얼" → "하이퍼캐주얼", "인디조각" → "인디게임", "낀지라이크" → "쿠키런라이크"
   - 게임기획: "제어시스템" (경제 맥락) → "재화 시스템/경제 시스템", "플레이션" → "인플레이션"
   - 게임기획: "브이로시" → "피드백", "바보자끼위해" → "해결하기 위해"
   - 발음유사: "도와지" → "도화지", "섣반" → "석권/차지", "흥냉/흥냥" → "인기"
   - 게임개발: "얼려얼/연렐렌즈" → "언리얼", "스프블리키초" → "스프라이트키트"
   - 게임개발: "탈력감" → "타격감", "입펇/입퇴" → "이펙트", "자도치" → "작업"
7. **문맥 흐름 교정**: 단어는 맞지만 조사가 어긋나서 문장이 안 읽히는 경우 자연스럽게 조사 수정
   - 예: "수강생들의 어려움을 겪으면서" → "수강생들이 어려움을 겪어서"
   - 예: "이해할 수 있는 자연으로" → "이해할 수 있는 수준으로"

## 절대 하지 말 것
- 발화자가 실제로 한 말의 의미를 바꾸거나 보충하지 마세요
- 축약 표현 유지 ("그래갖고", "해갖고", "근데" 등 구어체 그대로)
- 말이 꼬이거나 반복한 부분 유지 (면접 평가 대상)
- 습관어(음, 어, 그, 아) 유지
- 문장을 합치거나 분리하지 마세요
- 말투/어조를 바꾸지 마세요

## 반복 환각 제거 (매우 중요)
- STT 모델이 같은 문장/구절을 여러 번 반복 출력하는 경우가 있음
- 동일하거나 거의 동일한 문장이 2회 이상 연속 반복되면 1회만 남기고 제거
- 예: "공동의 목표는 프로젝트에서 공동의 목표는 프로젝트에서 공동의 목표는..." → "공동의 목표는 프로젝트에서"

## 판단 기준
- 해당 단어가 면접 답변 문맥에서 말이 되는가?
- 말이 안 되면 발음이 유사한 다른 단어가 있는가?
- 확신이 없으면 원본 유지 (잘못된 교정보다 오인식 유지가 나음)

교정된 텍스트만 출력하세요.`
      },
      {
        role: 'user',
        content: `[면접 질문] ${questionText}\n\n[음성 인식 결과 (교정 필요)]\n${rawTranscript}`
      },
    ],
  })

  return content?.trim() || rawTranscript
}

/**
 * 꼬리질문 생성 - 답변이 부족할 때만
 */
export async function generateFollowUp(questionText, roughTranscript, evaluatorNames = [], questionId = '') {
  // 자기소개, 마무리 질문은 꼬리질문 스킵
  if (questionId === 'beh-intro' || questionId === 'beh-lastq') {
    return { needed: false }
  }

  if (!roughTranscript || roughTranscript.trim().length < 5) {
    return { needed: false }
  }

  const nameList = evaluatorNames.map((e) => `- ${e.id}: ${e.name} (${e.role}, ${e.style})`).join('\n')

  const content = await callOpenRouter({
    model: 'anthropic/claude-sonnet-4',
    messages: [
      {
        role: 'system',
        content: `당신은 면접 패널의 일원입니다. 지원자의 답변을 듣고, 꼬리질문이 필요한지 판단합니다.

## 면접관 패널
${nameList}

## 꼬리질문 판단 기준

대부분의 답변에는 꼬리질문이 불필요합니다. 10개 중 2~3개 정도만 꼬리질문이 필요합니다.

꼬리질문이 필요한 경우 (매우 제한적):
- "없습니다" 등 회피 답변 → "비슷한 상황이라면 어떻게 하시겠어요?"
- 경험을 말했지만 본인 역할이 전혀 언급되지 않은 경우에만 → "그 과정에서 본인이 직접 한 행동은?"
- 결과나 교훈이 완전히 빠진 경우에만 → "그래서 결과는 어땠나요?"

꼬리질문이 불필요한 경우 (대부분 여기에 해당):
- 30초 이상 답변한 경우 → 거의 항상 스킵
- 사례를 하나라도 언급한 경우 → 스킵
- 조금 부족하더라도 평가 리포트에서 충분히 지적 가능 → 스킵
- 답변이 완벽하지 않아도 기본적인 내용이 있으면 → 스킵

## 금지되는 꼬리질문 (이런 질문은 절대 생성하지 마세요)
- "좀 더 구체적으로 말씀해주시겠어요?"
- "조금 더 자세히 설명해주시겠어요?"
- "예시를 들어주시겠어요?"
- "더 말씀해주실 것이 있나요?"
- 위와 비슷한 포괄적/범용적 질문 전부 금지

꼬리질문은 반드시 답변 내용에서 특정 키워드나 사건을 인용하며 질문해야 합니다.
예: "아까 '프론트엔드 작업이 지연됐다'고 하셨는데, 그때 백엔드 팀과 어떻게 일정을 조율하셨나요?"

반드시 JSON으로만 응답:
{ "needed": true, "question": "꼬리질문", "evaluatorId": "질문하는 면접관 id", "reason": "판단 이유" }
또는
{ "needed": false }`
      },
      {
        role: 'user',
        content: `[메인 질문] ${questionText}\n[답변 (음성 인식 결과, 부정확할 수 있음)] ${roughTranscript}`
      },
    ],
    jsonMode: true,
  })

  return safeParseJSON(content, 'generateFollowUp')
}

/**
 * 이력서/포폴 기반 면접 질문 생성
 */
export async function generateDocumentQuestions(extractedText, track, count = 2) {
  if (!extractedText || extractedText.trim().length < 50) return []

  const trackLabel = getTrackLabel(track)

  try {
    const content = await callOpenRouter({
      model: 'anthropic/claude-sonnet-4',
      messages: [
        {
          role: 'system',
          content: `당신은 면접관입니다. 지원자의 이력서/포트폴리오를 꼼꼼히 읽고, 문서에 적힌 **구체적인 내용을 직접 인용하며** 질문을 생성합니다.

핵심 규칙:
- 반드시 문서에 실제로 적힌 프로젝트명, 수치, 기술 스택, 성과를 **직접 언급하며** 질문할 것
- "이력서에 OO 프로젝트에서 XX를 담당하셨다고 적혀 있는데, ..." 형태로 시작
- "포트폴리오에 '업무 효율을 20% 향상시켰다'고 기재하셨는데, 그 수치의 근거는 무엇인가요?" 처럼 문서 내용을 직접 인용
- 문서에 없는 내용을 추측하여 질문하지 말 것
- "${trackLabel}" 직군 맥락에 맞는 질문
- 답변자가 실제 경험을 구체적으로 설명해야 하는 질문 (예/아니오 불가)
- ${count}개 질문 생성

좋은 질문 예시:
- "포트폴리오에 React와 Node.js로 실시간 채팅을 구현했다고 적혀 있는데, WebSocket 연결 관리를 어떻게 설계하셨나요?"
- "이력서에 '팀 리드로서 4명의 팀원을 관리했다'고 하셨는데, 팀 내 의견 충돌이 있었을 때 어떻게 조율하셨나요?"
- "포트폴리오에 기재된 OO 프로젝트의 MAU가 5000이라고 하셨는데, 이 지표를 개선하기 위해 어떤 시도를 하셨나요?"

나쁜 질문 (절대 금지):
- "이력서에서 언급하신 특정 프로젝트에서 가장 도전적이었던 상황은?" (구체적 인용 없이 뭉뚱그린 질문)
- "포트폴리오에 있는 기술 경험 중 가장 자신 있는 것은?" (문서 내용 미인용)

반드시 JSON 배열로만 응답:
[
  {
    "id": "doc-001",
    "text": "질문 내용 (반드시 문서 내용을 직접 인용하여 시작)",
    "category": "document",
    "difficulty": "intermediate",
    "keywords": ["키워드1", "키워드2"],
    "evaluationHints": "평가 포인트"
  }
]`
        },
        {
          role: 'user',
          content: `[이력서/포트폴리오 내용]\n${extractedText.slice(0, 3000)}`
        },
      ],
      jsonMode: true,
    })

    const questions = safeParseJSON(content, 'generateDocumentQuestions')
    return Array.isArray(questions) ? questions.slice(0, count) : []
  } catch (e) {
    console.warn('이력서 질문 생성 실패:', e.message)
    return []
  }
}

/**
 * 텍스트 분석 - 3명 평가자
 */
export async function analyzeText({ questions, answers, track, companySize = 'medium' }) {
  const answersText = answers
    .map((a, i) => {
      let text = `[질문 ${i + 1}] ${a.questionText}\n[답변] ${a.transcript || '(답변 없음)'}\n[녹화 시간] ${a.recordingDuration}초`
      if (a.followUp && a.followUp.question) {
        text += `\n[꼬리질문] ${a.followUp.question}\n[꼬리질문 답변] ${a.followUp.transcript || '(답변 없음)'}`
      }
      return text
    })
    .join('\n\n---\n\n')

  const trackLabel = getTrackLabel(track)
  const evaluatorConfig = getEvaluatorConfig(track, trackLabel, companySize)

  const systemPrompt = `당신은 면접 평가 시스템입니다.
이 서비스는 취업 준비 수강생이 튜터와의 1:1 모의면접 전에 연습하는 도구입니다.

아래 면접 답변에 대해 3명의 면접관이 각각 독립적으로 평가합니다.

## 면접관 구성
${evaluatorConfig.prompt}

## 평가 기준 (각 0~100점)
- relevance: 질문 의도 파악 및 답변 적합성
- structure: 체계적 답변 구조 (도입-본론-마무리, 사례 중심)
- keywords: 핵심 키워드 활용 (인성면접: 협업/소통/성장 등 역량 키워드)
- specificity: 구체적 사례/수치 제시

## 채점 기준
이 서비스는 면접 연습 도구입니다. 수강생이 성장할 수 있도록 적절한 기준을 유지하되, 지나치게 엄격하지 않게 평가하세요.

점수 분포 가이드:
- 80~100: 우수한 답변 (구체적 사례 + 논리적 구조 + 핵심 키워드)
- 60~79: 양호한 답변 (기본은 갖췄지만 보완 필요)
- 40~59: 부족한 답변 (핵심이 빠지거나 추상적)
- 20~39: 매우 부족 (내용이 거의 없거나 질문 이해 못함)
- 0~19: 답변 거부/회피

감점 기준:
- 답변 거부/회피("없습니다", "잘 모르겠습니다" 등): 모든 항목 15점 이하, pass=false
- 한두 문장으로 끝나는 짧은 답변: 최대 40점
- 질문과 무관한 답변: relevance 20점 이하
- 구체적 사례 없이 추상적으로만 답변: specificity 40점 이하
- "마지막으로 하고 싶은 말" 같은 자유 질문은 짧게 답해도 크게 감점하지 마세요

일반 원칙:
- 내용이 있고 질문에 맞게 답했으면 최소 50점 이상
- 경험을 말하려고 노력한 흔적이 보이면 가점
- 면접 초보자가 대상이라는 점을 고려하되, 개선점은 명확히 지적

## 피드백 작성 원칙 (매우 중요)
- **질문별 comment**: 최소 4~5문장. 무엇을 잘했는지, 무엇이 부족한지, 어떻게 개선하면 좋은지를 구체적으로 작성.
- **overallComment**: 최소 5~6문장. 면접 전체를 관통하는 총평. 이 수강생의 면접 준비 수준, 강점 패턴, 반복되는 약점, 다음 연습에서 집중해야 할 것을 포함.
- **strengths/improvements**: 각 최소 3개. 추상적이지 않게, 실제 답변 내용을 인용하며 작성.
- 단편적인 한 줄 피드백 금지. 수강생이 읽고 실제로 개선할 수 있는 수준의 구체적 피드백을 작성하세요.

## 문제 구절 지적 (problemPhrases)
각 질문 피드백에서, 답변 원문 중 문제가 되는 구절을 정확히 인용하여 지적해주세요.
- "text": 답변 원문에서 그대로 복사한 문제 구절 (반드시 원문과 일치해야 함)
- "reason": 왜 문제인지 간단히
- "severity": "warning"(개선 필요) 또는 "error"(심각한 문제)
- 문제가 없으면 빈 배열 []

반드시 아래 JSON 형식으로만 응답하세요:
{
  "evaluators": [
${evaluatorConfig.jsonExample}
  ],
  "speechFeedback": {
    "fillerWordComment": "습관어 사용에 대한 코멘트",
    "silenceComment": "침묵 구간에 대한 코멘트",
    "paceComment": "답변 속도/시간에 대한 코멘트"
  },
  "sampleAnswers": [
    { "questionIndex": 0, "answer": "모범 답안 (2~3문장)" }
  ]
}`


  const content = await callOpenRouter({
    model: 'anthropic/claude-sonnet-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: answersText },
    ],
    jsonMode: true,
  })

  return safeParseJSON(content, 'analyzeText')
}

/**
 * 비전 분석 - 비언어적 요소 평가
 */
export async function analyzeVision({ answers }) {
  const frameMessages = []
  answers.forEach((a, i) => {
    if (a.frames && a.frames.length > 0) {
      frameMessages.push({ type: 'text', text: `[질문 ${i + 1}의 캡처 프레임 ${a.frames.length}장]` })
      a.frames.forEach((frame) => {
        frameMessages.push({ type: 'image_url', image_url: { url: frame } })
      })
    }
  })

  if (frameMessages.length === 0) {
    return { visionFeedbacks: [], overallVisionScore: 0, tips: [] }
  }

  const systemPrompt = `당신은 면접 비언어적 커뮤니케이션 평가 전문가입니다.
면접자의 캡처 이미지를 분석하여 비언어적 요소를 엄격하게 평가해주세요.
각 질문에 대해 5초 간격으로 캡처한 여러 장의 프레임이 제공됩니다.

## 평가 기준 (각 0~100점)
- eyeContact: 카메라(면접관)를 응시하고 있는가? 시선이 다른 곳을 보고 있지 않은가?
- expression: 면접에 적절한 표정인가? 진지함, 자연스러운 미소, 자신감이 느껴지는가?
- posture: 바른 자세인가? 안정적으로 앉아있는가? 과도한 움직임은 없는가?

## 반드시 감지해야 할 문제 행동 (발견 시 해당 항목 20점 이하)
- 카메라를 보지 않고 다른 곳을 응시 (모니터, 아래, 옆 등)
- 음식 섭취, 음료 마시기
- 과도한 몸 흔들기, 의자 회전
- 손 흔들기, 부적절한 제스처
- 턱 괴기, 팔짱 끼기
- 하품, 기지개
- 스마트폰 사용
- 면접에 부적절한 복장이나 배경
- 무표정/무관심한 태도
- 대답 중 웃음이 과도하거나 부적절한 경우

## 채점 원칙
- 문제 행동이 1개 프레임이라도 발견되면 해당 항목 점수를 크게 감점
- 여러 프레임에서 반복되면 더 큰 감점
- 전반적으로 양호해도 관대하게 점수를 주지 마세요 (70점 이상은 "매우 좋다"의 의미)
- 문제가 발견된 프레임은 반드시 problemFrames에 기재

반드시 아래 JSON 형식으로만 응답하세요:
{
  "visionFeedbacks": [
    {
      "questionIndex": 0,
      "eyeContact": { "score": 0, "comment": "코멘트" },
      "expression": { "score": 0, "comment": "코멘트" },
      "posture": { "score": 0, "comment": "코멘트" },
      "problemFrames": [
        { "frameIndex": 0, "issue": "문제 설명 (예: 시선이 아래를 향함)", "category": "eyeContact" }
      ]
    }
  ],
  "overallVisionScore": 0,
  "tips": ["팁1", "팁2"]
}`

  const content = await callOpenRouter({
    model: 'openai/gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [
        { type: 'text', text: '아래 면접 캡처 이미지들을 분석해주세요.' },
        ...frameMessages,
      ]},
    ],
    jsonMode: true,
  })

  return safeParseJSON(content, 'analyzeVision')
}

/**
 * LLM 응답에서 JSON을 안전하게 추출
 * 마크다운 코드블록(```json ... ```)이 감싸져 있는 경우도 처리
 */
function safeParseJSON(content, label) {
  if (!content) throw new Error(`${label}: 응답이 비어있습니다`)

  // 1차: 그대로 파싱
  try {
    return JSON.parse(content)
  } catch (e) {
    // 2차: 마크다운 코드블록 제거 후 파싱
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    try {
      return JSON.parse(cleaned)
    } catch (e2) {
      // 3차: JSON 부분만 추출 (첫 { ~ 마지막 })
      const match = content.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          return JSON.parse(match[0])
        } catch (e3) {
          // 모든 시도 실패
        }
      }
      console.error(`[${label}] JSON 파싱 실패. 원본:`, content)
      throw new Error(`${label}: JSON 파싱 실패`)
    }
  }
}

function getTrackLabel(track) {
  const labels = { behavioral: '인성면접', unity: 'Unity 개발', unreal: 'Unreal Engine 개발', design: '게임기획' }
  return labels[track] || '종합'
}

function getEvaluatorConfig(track, trackLabel, companySize = 'medium') {
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

  const prompt = evaluators.map((ev, i) => (
    `${i + 1}. **${ev.name}** (${ev.role})
   - ${ev.focus} 위주 평가
   - ${ev.prompt}`
  )).join('\n\n')

  const jsonExample = evaluators.map((ev) => (
    `    {
      "id": "${ev.id}",
      "name": "${ev.name}",
      "role": "${ev.role}",
      ${feedbackTemplate}
    }`
  )).join(',\n')

  return { prompt, jsonExample }
}
