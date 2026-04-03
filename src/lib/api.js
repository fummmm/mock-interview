/**
 * OpenRouter API 호출 헬퍼
 * 배포: /api/openrouter 서버 프록시 경유 (API 키 서버에만 보관)
 * 개발: VITE_OPENROUTER_API_KEY 있으면 직접 호출 (폴백)
 */
import { getEvaluators } from '../data/evaluators'

const isDev = import.meta.env.DEV
const DIRECT_URL = 'https://openrouter.ai/api/v1/chat/completions'
const PROXY_URL = '/api/openrouter'

async function callOpenRouter({ model, messages, jsonMode = false, maxTokens = null, temperature = null, timeoutMs = 120000 }) {
  const body = { model, messages }
  if (jsonMode) body.response_format = { type: 'json_object' }
  if (maxTokens) body.max_tokens = maxTokens
  if (temperature !== null) body.temperature = temperature

  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
  const timeout = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined

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
// 트랙별 전문용어 교정 사전
const TRACK_TERMS = {
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

export async function correctTranscript(rawTranscript, questionText, track = '') {
  if (!rawTranscript || rawTranscript.trim().length < 5) return rawTranscript || ''

  const content = await callOpenRouter({
    model: 'anthropic/claude-sonnet-4',
    maxTokens: 8192,
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

${track && TRACK_TERMS[track] ? `8. **${track.toUpperCase()} 트랙 전문용어 교정 (이 트랙 면접이므로 반드시 적용)**:${TRACK_TERMS[track]}` : ''}

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

  const corrected = content?.trim() || rawTranscript

  // 환각 방어 1: 원본이 30자 미만인데 교정 결과가 3배 이상 길면 LLM이 답변을 만들어낸 것
  if (rawTranscript.length < 30 && corrected.length > rawTranscript.length * 3 + 20) {
    console.warn('[교정] 환각 의심 - 원본 유지:', rawTranscript.length, '→', corrected.length)
    return rawTranscript
  }

  // 환각 방어 2: 원본이 Whisper 전형적 환각이면 빈 문자열 반환
  const hallucinationCheck = /^\s*(MBC|KBS|SBS|JTBC|YTN)\s*뉴스|뉴스.{0,5}입니다|^\s*안녕하세요[,.]?\s*.{1,5}입니다\.?$|^\s*.{1,5}입니다\.?$/
  if (hallucinationCheck.test(rawTranscript.trim()) || rawTranscript.trim().length < 15) {
    console.warn('[교정] Whisper 환각 감지 - 빈 답변 처리:', rawTranscript)
    return ''
  }

  return corrected
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

  // 매번 다른 관점으로 질문하도록 랜덤 시드
  const angles = [
    '기술적 깊이 (구현 방식, 아키텍처 선택 이유, 트레이드오프)',
    '의사결정 과정 (왜 이 기술/방법을 선택했는지, 대안은 없었는지)',
    '문제 해결 (어려웠던 점, 실패 경험, 극복 방법)',
    '성장과 회고 (배운 점, 다시 한다면 다르게 할 점)',
    '가정/시나리오 (만약 ~한 상황이라면 어떻게 할지)',
    '확장적 사고 (이 경험을 다른 상황에 어떻게 적용할 수 있을지)',
  ]
  const selectedAngle = angles[Math.floor(Math.random() * angles.length)]

  try {
    const content = await callOpenRouter({
      model: 'anthropic/claude-sonnet-4',
      temperature: 1.1,
      messages: [
        {
          role: 'system',
          content: `당신은 면접관입니다. 지원자의 이력서/포트폴리오를 읽고, 문서 내용을 기반으로 질문을 생성합니다.

## 이번 질문의 관점
**${selectedAngle}** 위주로 질문하세요.

## 질문 다양화 규칙 (매우 중요)
단순히 "~한 경험이 있나요?", "~에 대해 말씀해주세요" 패턴만 쓰지 마세요.
아래 다양한 질문 유형 중에서 섞어서 사용하세요:

- **의사결정형**: "OO 프로젝트에서 왜 A 기술 대신 B를 선택하셨나요?"
- **가정형**: "포트폴리오의 OO 시스템을 10배 규모로 확장해야 한다면 어떻게 설계하시겠어요?"
- **회고형**: "이력서에 적힌 OO 프로젝트를 다시 진행한다면 어떤 점을 바꾸고 싶으신가요?"
- **깊이형**: "OO에서 XX를 구현하셨다고 적혀 있는데, 내부적으로 어떤 구조로 동작하나요?"
- **비교형**: "포트폴리오에 A와 B 두 프로젝트가 있는데, 기술적으로 가장 큰 차이점은 무엇이었나요?"
- **시나리오형**: "이력서의 OO 경험을 바탕으로, 저희 팀에서 비슷한 문제가 생기면 어떻게 접근하시겠어요?"

## 핵심 규칙
- 문서에 적힌 프로젝트명, 수치, 기술 스택을 직접 인용하며 질문
- 문서에 없는 내용을 추측하여 질문하지 말 것
- "${trackLabel}" 직군 맥락에 맞게
- ${count}개 질문, 각각 다른 유형으로

## 프로젝트/문서 분산 규칙 (매우 중요)
- [이력서]와 [포트폴리오]가 모두 있으면 **반드시 양쪽에서 골고루** 질문할 것
- 같은 프로젝트에서 2개 이상 질문하지 말 것 (1프로젝트 = 1질문)
- 문서 앞부분(첫 번째 프로젝트)에만 편중하지 말 것 - 중간이나 하단의 프로젝트도 동등하게 선택
- 포트폴리오에 구체적인 프로젝트 설명이 있으면 반드시 1개 이상 포트폴리오 기반 질문 포함

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
          content: extractedText
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
 * 채용 공고 기반 맞춤형 면접 질문 생성
 * companyName, position: 텍스트 입력
 * screenshots: base64 이미지 배열 (자격요건/우대사항 캡처)
 */
export async function generateJobPostingQuestions({ companyName, position, screenshots = [] }, track, count = 2) {
  if (!companyName && !position && screenshots.length === 0) return []

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
    userContent.push({ type: 'text', text: '위 이미지는 채용 공고의 자격요건/우대사항 캡처입니다. 이 내용을 분석하여 면접 질문을 생성해주세요.' })
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
        { role: 'user', content: useVision ? userContent : (userContent.map(c => c.text).join('\n')) },
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

    const questions = Array.isArray(parsed) ? parsed : (parsed?.questions || [])
    return questions.slice(0, count)
  } catch (e) {
    console.warn('공고 질문 생성 실패:', e.message)
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
${companySize === 'large' ? `[대기업 모드] 높은 수준의 답변을 요구합니다. 관대하게 채점하지 마세요.

점수 분포 가이드:
- 85~100: 탁월한 답변 (구체적 사례 + 수치 근거 + 논리적 구조 + 핵심 키워드 + 차별화된 인사이트)
- 70~84: 양호한 답변 (기본 구조는 갖췄으나 깊이나 구체성이 부족)
- 50~69: 보통 답변 (내용은 있지만 평범하고 차별점 없음)
- 30~49: 부족한 답변 (핵심이 빠지거나 추상적, 사례 부재)
- 0~29: 매우 부족 (내용 없음, 질문 미이해, 답변 거부)

대기업 감점 기준:
- 구체적 수치/성과 없이 "열심히 했다" 식의 답변: 최대 60점
- 상황-과제-행동-결과 구조 없이 나열식 답변: structure 최대 55점
- 답변이 30초 미만으로 짧은 경우: 최대 45점
- 질문 의도를 정확히 파악하지 못한 답변: relevance 최대 50점
- "없습니다", "잘 모르겠습니다" 등 답변 회피: 모든 항목 15점 이하

대기업 가점 기준:
- 정량적 성과(수치, 비율, 기간)를 포함한 답변: +5~10점
- 실패 경험에서 배운 점까지 언급: +5점
- 면접관의 의도를 넘어서는 깊이 있는 답변: +5~10점`
: companySize === 'small' ? `[스타트업 모드] 실무 역량과 성장 가능성 중심으로 평가합니다.

점수 분포 가이드:
- 80~100: 우수한 답변 (구체적 사례 + 실무 감각 + 성장 의지)
- 60~79: 양호한 답변 (기본은 갖췄지만 보완 필요)
- 40~59: 부족한 답변 (핵심이 빠지거나 추상적)
- 20~39: 매우 부족 (내용이 거의 없거나 질문 이해 못함)
- 0~19: 답변 거부/회피

일반 원칙:
- 경험이 적어도 학습 의지와 성장 가능성이 보이면 가점
- 스타트업 특성상 다양한 역할 수행 경험을 높이 평가
- 면접 초보자가 대상이므로 격려 중심 피드백`
: `[중소/중견 모드] 기본기와 팀 적합성 중심으로 평가합니다.

점수 분포 가이드:
- 80~100: 우수한 답변 (구체적 사례 + 논리적 구조 + 핵심 키워드)
- 60~79: 양호한 답변 (기본은 갖췄지만 보완 필요)
- 40~59: 부족한 답변 (핵심이 빠지거나 추상적)
- 20~39: 매우 부족 (내용이 거의 없거나 질문 이해 못함)
- 0~19: 답변 거부/회피

일반 원칙:
- 내용이 있고 질문에 맞게 답했으면 최소 50점 이상
- 경험을 말하려고 노력한 흔적이 보이면 가점
- 면접 초보자가 대상이라는 점을 고려하되, 개선점은 명확히 지적`}

공통 감점 기준:
- 답변 거부/회피: 모든 항목 15점 이하, pass=false
- 질문과 완전히 무관한 답변: relevance 20점 이하

## 피드백 작성 원칙 (매우 중요)
- **질문별 comment**: 최소 4~5문장. 무엇을 잘했는지, 무엇이 부족한지, 어떻게 개선하면 좋은지를 구체적으로 작성.
- **overallComment**: 최소 5~6문장. 면접 전체를 관통하는 총평. 이 수강생의 면접 준비 수준, 강점 패턴, 반복되는 약점, 다음 연습에서 집중해야 할 것을 포함.
- **strengths/improvements**: 각 최소 3개. 추상적이지 않게, 실제 답변 내용을 인용하며 작성.
- 단편적인 한 줄 피드백 금지. 수강생이 읽고 실제로 개선할 수 있는 수준의 구체적 피드백을 작성하세요.
- 피드백에 "STAR", "STAR 기법", "STAR 구조" 등의 용어를 절대 사용하지 마세요. 내부 평가 기준일 뿐 수강생에게 노출하지 않습니다.

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


  // 최대 3회 재시도 (간격 증가: 2초, 5초)
  const delays = [2000, 5000]
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`[analyzeText] ${attempt + 1}차 시도 (답변 ${answers.length}개, 입력 ${answersText.length}자)`)
      const content = await callOpenRouter({
        model: 'anthropic/claude-sonnet-4',
        maxTokens: 65536,
        timeoutMs: 480000, // 8분
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: answersText },
        ],
        jsonMode: true,
      })

      console.log(`[analyzeText] ${attempt + 1}차 응답 수신 (${content?.length || 0}자)`)
      const parsed = safeParseJSON(content, 'analyzeText')

      // 평가자 데이터 최소 검증 (evaluators 배열만 있으면 통과)
      if (!parsed.evaluators || parsed.evaluators.length === 0) {
        throw new Error('evaluators 데이터가 비어있습니다 (응답 잘림 가능성)')
      }

      return parsed
    } catch (e) {
      lastError = e
      console.warn(`[analyzeText] ${attempt + 1}차 시도 실패:`, e.message)
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, delays[attempt]))
      }
    }
  }
  throw lastError
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
          } catch (e4) { /* 최종 실패 */ }
        }
      }
      console.error(`[${label}] JSON 파싱 실패. 원본 길이: ${content.length}자, 앞 200자:`, content.slice(0, 200))
      throw new Error(`${label}: JSON 파싱 실패 (응답 ${content.length}자)`)
    }
  }
}

function getTrackLabel(track) {
  const labels = { behavioral: '인성면접', unity: 'Unity 개발', unreal: 'Unreal Engine 개발', pm: 'PM/기획', design: '게임기획', spring: 'Spring 백엔드 개발', cs: 'CS 기초 지식' }
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
