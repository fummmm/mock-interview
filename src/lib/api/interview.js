/**
 * 면접 진행 관련 API - STT 교정, 꼬리질문 생성
 */
import { callOpenRouter, TRACK_TERMS, safeParseJSON } from './client'

/**
 * STT 텍스트 교정 - 음성 인식 오류를 문맥에 맞게 보정
 * Whisper base의 부정확한 한국어를 LLM이 교정
 */
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

교정된 텍스트만 출력하세요.`,
      },
      {
        role: 'user',
        content: `[면접 질문] ${questionText}\n\n[음성 인식 결과 (교정 필요)]\n${rawTranscript}`,
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
  const hallucinationCheck =
    /^\s*(MBC|KBS|SBS|JTBC|YTN)\s*뉴스|뉴스.{0,5}입니다|^\s*안녕하세요[,.]?\s*.{1,5}입니다\.?$|^\s*.{1,5}입니다\.?$/
  if (hallucinationCheck.test(rawTranscript.trim()) || rawTranscript.trim().length < 15) {
    console.warn('[교정] Whisper 환각 감지 - 빈 답변 처리:', rawTranscript)
    return ''
  }

  return corrected
}

/**
 * 꼬리질문 판단+생성 - 3-Criteria Check (Haiku)
 * STT 텍스트를 받아 꼬리질문 필요 여부를 판단하고 생성한다.
 *
 * @param {string} questionText - 메인 질문 텍스트
 * @param {string} correctedTranscript - Whisper STT 원본 또는 교정 완료된 답변 텍스트
 * @param {Array} evaluatorNames - 면접관 패널 배열 [{id, name, role, style}, ...]
 * @param {string} questionId - 질문 ID (사전 필터용)
 * @param {number} recordingDuration - 녹화 시간 (초)
 * @returns {{ needed: boolean, question?: string, evaluatorId?: string, deficiency?: string, c1?: boolean, c2?: boolean, c3?: boolean, reason?: string }}
 */
export async function generateFollowUp(
  questionText,
  correctedTranscript,
  evaluatorNames = [],
  questionId = '',
  recordingDuration = 0,
) {
  try {
    // --- 사전 필터 ---

    // 자기소개, 마무리 질문은 꼬리질문 스킵
    if (questionId === 'beh-intro' || questionId === 'beh-lastq') {
      return { needed: false }
    }

    // 5초 미만 답변 → 답변 의사 없음으로 판단, 스킵
    if (recordingDuration < 5) {
      return { needed: false }
    }

    // incomplete 유형: 5~15초 녹화 + 교정 텍스트 30자 미만 → 하드코딩 꼬리질문
    const transcriptLength = (correctedTranscript || '').trim().length
    if (recordingDuration >= 5 && recordingDuration <= 15 && transcriptLength < 30) {
      const asker = evaluatorNames[0]
      return {
        needed: true,
        question:
          '답변이 짧았는데, 비슷한 상황을 경험하지 못했더라도 어떻게 접근하실지 말씀해주시겠어요?',
        evaluatorId: asker?.id || 'hr',
        deficiency: 'incomplete',
        c1: false,
        c2: false,
        c3: false,
        reason: '답변이 극히 짧음 (15초 이내, 30자 미만)',
      }
    }

    // --- Haiku 호출 ---

    const nameList = evaluatorNames
      .map((e) => `- ${e.id}: ${e.name} (${e.role}, ${e.style})`)
      .join('\n')

    const content = await callOpenRouter({
      model: 'anthropic/claude-haiku-4-5-20251001',
      maxTokens: 512,
      temperature: 0.3,
      timeoutMs: 8000,
      jsonMode: true,
      messages: [
        {
          role: 'system',
          content: `당신은 면접 패널의 일원입니다. 지원자의 답변을 3가지 기준으로 평가하고, 필요 시 꼬리질문을 생성합니다.

## 면접관 패널
${nameList}

## 3가지 판단 기준 (모두 충족 시 PASS)

1. **질문 의도 부합 (C1)**: 질문의 핵심 포인트에 직접 답변했는가?
   - PASS: 질문이 묻는 내용에 대해 직접적으로 답함
   - FAIL: 질문을 회피하거나, 전혀 관련 없는 이야기만 함

2. **구체적 사례 (C2)**: 실제 경험이나 프로젝트를 1개 이상 언급했는가?
   - PASS: 실제 프로젝트명, 상황, 시기 등 구체적 사례가 있음
   - FAIL: "~할 것 같습니다", "~하는 게 중요합니다" 같은 일반론만 있음

3. **본인 역할 (C3)**: 본인이 직접 한 행동/역할을 명시했는가?
   - PASS: "제가 ~했습니다", "저는 ~를 담당" 등 본인 행동이 명확함
   - FAIL: "저희 팀이 ~했습니다"만 있고 본인의 구체적 기여가 불분명

## 꼬리질문 유형

C1 FAIL → evasion: 가상 시나리오로 전환하여 사고 과정 확인
C2 FAIL → abstract: 답변 속 키워드를 인용하며 구체적 사례 요청
C3 FAIL → role-unclear: 답변 속 활동을 인용하며 본인 역할 질문
3개 모두 PASS이지만 결과/교훈 완전 누락 → result-missing: 결과 확인

## STT 입력 안내

아래 답변 텍스트는 Whisper 음성 인식 원본입니다. 교정을 거치지 않았으므로:
- 단어 하나하나의 정확성에 의존하지 마세요
- 답변의 전체 흐름, 맥락, 의미에 집중하여 판단하세요
- 고유명사(회사명, 프로젝트명 등)가 잘못 인식되었을 수 있습니다
- "어", "음" 같은 필러워드가 많을 수 있으나 판단에 영향주지 마세요

## 판단 원칙

- 3가지 기준을 엄격하게 적용하되, 애매한 경우에는 꼬리질문을 생성하지 마세요.
- 평가 리포트에서 충분히 지적할 수 있는 수준의 부족함이면 꼬리질문 불필요입니다.
- 꼬리질문은 답변이 명백히 부족할 때만 생성하세요.

## 꼬리질문 생성 규칙

- 반드시 답변 내용에서 특정 키워드, 프로젝트명, 사건을 인용하며 질문할 것
- 답변 내용에서 키워드를 인용하되, STT 오인식일 수 있으므로 의미 단위로 인용하세요
- 예: "프론트 핀트 개발" → "프론트엔드 개발 경험"으로 의미를 살려 인용
- 금지 표현: "좀 더 구체적으로", "자세히 설명해주시겠어요", "예시를 들어주시겠어요", "더 말씀해주실 것이 있나요"
- 꼬리질문은 1문장으로. 면접관 말투에 맞게.

반드시 아래 JSON 형식으로만 응답:

꼬리질문이 필요한 경우:
{
  "c1": true/false,
  "c2": true/false,
  "c3": true/false,
  "deficiency": "evasion|abstract|role-unclear|result-missing",
  "needed": true,
  "question": "꼬리질문 내용",
  "evaluatorId": "질문하는 면접관 id",
  "reason": "1줄 판단 이유"
}

꼬리질문이 불필요한 경우:
{
  "c1": true,
  "c2": true,
  "c3": true,
  "needed": false
}`,
        },
        {
          role: 'user',
          content: `[메인 질문] ${questionText}\n[답변 (음성 인식 원본, 오인식 포함 가능)] ${correctedTranscript}\n[녹화 시간] ${recordingDuration}초`,
        },
      ],
    })

    const result = safeParseJSON(content, 'generateFollowUp')

    // Haiku 응답에 needed 필드가 없으면 환각 방어 → 스킵
    if (typeof result.needed !== 'boolean') {
      console.warn('[generateFollowUp] Haiku 응답에 needed 필드 없음, 스킵 처리')
      return { needed: false }
    }

    return result
  } catch (error) {
    // 모든 에러(타임아웃, JSON 파싱 실패, 네트워크 등) → 꼬리질문 스킵
    console.warn('[generateFollowUp] 에러 발생, 꼬리질문 스킵:', error.message)
    return { needed: false }
  }
}
