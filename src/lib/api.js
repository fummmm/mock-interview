/**
 * OpenRouter API 호출 헬퍼
 *
 * 개발: 클라이언트에서 직접 OpenRouter 호출 (VITE_ 환경변수)
 * 배포: Vercel Serverless Function 프록시로 전환 가능
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

function getApiKey() {
  const key = import.meta.env.VITE_OPENROUTER_API_KEY
  if (!key) console.warn('VITE_OPENROUTER_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.')
  return key
}

async function callOpenRouter({ model, messages, jsonMode = false }) {
  const body = { model, messages }
  if (jsonMode) body.response_format = { type: 'json_object' }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'AI Mock Interview',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`OpenRouter API error (${res.status}): ${error}`)
  }

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
    model: 'anthropic/claude-3.5-haiku',
    messages: [
      {
        role: 'system',
        content: `당신은 음성 인식(STT) 결과를 교정하는 전문가입니다.
면접 답변을 음성 인식한 텍스트를 읽을 수 있도록 최소한으로 교정합니다.

교정 원칙:
1. 오인식 수정: 문맥상 명백히 잘못 인식된 단어를 올바른 단어로 교체 (예: "생물에" → "신입에", "월요소" → "어릴 때부터")
2. 기본 문장 부호: 문장 끝에 마침표, 자연스러운 위치에 쉼표 추가. 과도하지 않게.
3. 조사 수정: STT가 잘못 붙인 조사만 자연스럽게 교정 (예: "게임을를" → "게임을")

절대 하지 말 것:
- 내용 추가, 삭제, 의역 금지 (한 단어도 새로 만들지 마세요)
- 축약 표현을 풀어쓰지 마세요 ("그래갖고", "해갖고" 등 그대로)
- 말이 꼬이거나 반복한 부분도 그대로 유지 (평가 대상)
- 습관어(음, 어, 그, 아)를 제거하거나 바꾸지 마세요
- 문장을 합치거나 분리하지 마세요
- 말투나 어조를 바꾸지 마세요 (반말↔존댓말 변환 금지)

교정된 텍스트만 출력하세요. 설명이나 주석은 붙이지 마세요.`
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
 * 텍스트 분석 - 3명 평가자
 */
export async function analyzeText({ questions, answers, track }) {
  const answersText = answers
    .map((a, i) => `[질문 ${i + 1}] ${a.questionText}\n[답변] ${a.transcript || '(답변 없음)'}\n[녹화 시간] ${a.recordingDuration}초\n[습관어(음,어 등)] ${a.fillerWordCount}회\n[침묵 구간] ${a.silenceSegments.length}회`)
    .join('\n\n---\n\n')

  const trackLabel = getTrackLabel(track)
  const evaluatorConfig = getEvaluatorConfig(track, trackLabel)

  const systemPrompt = `당신은 면접 평가 시스템입니다.
아래 면접 답변에 대해 3명의 면접관이 각각 독립적으로 평가합니다.

## 면접관 구성
${evaluatorConfig.prompt}

## 평가 기준 (각 0~100점)
- relevance: 질문 의도 파악 및 답변 적합성
- structure: 체계적 답변 구조 (STAR 기법 등)
- keywords: 기술 용어 및 핵심 키워드 활용
- specificity: 구체적 사례/수치 제시

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

  console.log('[analyzeText] 요청 전송 중...')
  console.log('[analyzeText] 답변 요약:', answersText.slice(0, 200))

  const content = await callOpenRouter({
    model: 'anthropic/claude-3.5-haiku',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: answersText },
    ],
    jsonMode: true,
  })

  console.log('[analyzeText] 원본 응답:', content?.slice(0, 300))
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
면접자의 캡처 이미지를 분석하여 비언어적 요소를 평가해주세요.
각 질문에 대해 여러 장의 프레임이 제공됩니다 (시작/중간/끝 시점 캡처).

평가 기준:
- eyeContact: 카메라(면접관) 응시 여부 (0~100)
- expression: 표정의 자연스러움과 자신감 (0~100)
- posture: 자세의 바름과 안정감 (0~100)

문제가 발견된 프레임이 있다면 problemFrames에 몇 번째 프레임(0부터)인지와 이유를 기재해주세요.

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
    model: 'openai/gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [
        { type: 'text', text: '아래 면접 캡처 이미지들을 분석해주세요.' },
        ...frameMessages,
      ]},
    ],
    jsonMode: true,
  })

  console.log('[analyzeVision] 원본 응답:', content?.slice(0, 300))
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

function getEvaluatorConfig(track, trackLabel) {
  const feedbackTemplate = `"questionFeedbacks": [
        {
          "questionIndex": 0,
          "scores": { "relevance": 0, "structure": 0, "keywords": 0, "specificity": 0 },
          "comment": "이 질문에 대한 종합 코멘트 (2~3문장)",
          "problemPhrases": [
            { "text": "문제 구절 (원문 그대로)", "reason": "이유", "severity": "warning" }
          ]
        }
      ],
      "overallComment": "면접 전체에 대한 총평 (3~4문장)",
      "strengths": ["강점1", "강점2"],
      "improvements": ["개선점1", "개선점2"],
      "pass": true`

  if (track === 'behavioral') {
    return {
      prompt: `1. **현직 팀장** (IT/게임 업계 팀장급, 경력 8년+)
   - 실무 역량, 팀 적합성, 문제 해결 능력 위주 평가
   - 솔직하고 실무적인 피드백 스타일

2. **인사 담당자** (HR 매니저, 경력 6년+)
   - 인성, 조직 문화 적합성, 소통 능력, 태도 위주 평가
   - 따뜻하지만 핵심을 짚는 피드백 스타일

3. **임원 면접관** (이사/본부장급, 경력 15년+)
   - 성장 가능성, 가치관, 리더십 잠재력, 장기 비전 위주 평가
   - 큰 그림을 보는 전략적 피드백 스타일`,
      jsonExample: `    {
      "id": "team_lead",
      "name": "현직 팀장",
      "role": "IT/게임 팀장",
      ${feedbackTemplate}
    },
    {
      "id": "hr",
      "name": "인사 담당자",
      "role": "HR 매니저",
      ${feedbackTemplate}
    },
    {
      "id": "executive",
      "name": "임원 면접관",
      "role": "이사급",
      ${feedbackTemplate}
    }`,
    }
  }

  // 기술 트랙 (Unity/Unreal/기획)
  return {
    prompt: `1. **실무 전문가 A** (${trackLabel} 시니어, 경력 7년+)
   - 기술적 정확성, 실무 적용 가능성, 문제 해결 역량 위주 평가
   - 솔직하고 직설적인 피드백 스타일

2. **실무 전문가 B** (${trackLabel} 리드급, 경력 10년+)
   - 설계 사고, 커뮤니케이션 능력, 성장 가능성 위주 평가
   - 건설적이고 구체적인 피드백 스타일

3. **인사 담당자** (HR, 경력 5년+)
   - 조직 적합성, 태도, 자기 표현력, 협업 역량 위주 평가
   - 따뜻하지만 핵심을 짚는 피드백 스타일`,
    jsonExample: `    {
      "id": "expert_a",
      "name": "실무 전문가 A",
      "role": "${trackLabel} 시니어",
      ${feedbackTemplate}
    },
    {
      "id": "expert_b",
      "name": "실무 전문가 B",
      "role": "${trackLabel} 리드",
      ${feedbackTemplate}
    },
    {
      "id": "hr",
      "name": "인사 담당자",
      "role": "HR",
      ${feedbackTemplate}
    }`,
  }
}
