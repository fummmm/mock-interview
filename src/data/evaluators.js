/**
 * 면접관 페르소나 정의
 * 브리핑 화면, 꼬리질문 표시, 리포트에서 공용 참조
 */

export const EVALUATORS = {
  behavioral: [
    {
      id: 'team_lead',
      name: '김도현 팀장',
      role: '현직 팀장',
      icon: '💼',
      style: '솔직하고 실무적',
      description: 'IT/게임 업계 팀장 8년차. 실무 역량과 팀 적합성을 냉정하게 평가합니다.',
      focus: '실무 경험, 문제 해결력, 팀워크',
    },
    {
      id: 'coach',
      name: '이서연 코치',
      role: '면접 코치',
      icon: '📋',
      style: '격려와 코칭 중심',
      description: '커리어 코칭 전문가 10년차. 답변 구조와 전달력을 분석하고 개선 방향을 제시합니다.',
      focus: '답변 구조, 표현력, 면접 기본기',
    },
    {
      id: 'executive',
      name: '박정우 이사',
      role: '임원 면접관',
      icon: '🏢',
      style: '전략적, 큰 그림',
      description: '이사급 임원 15년차. 성장 가능성과 조직 적합성을 종합적으로 판단합니다.',
      focus: '성장 가능성, 가치관, 장기 비전',
    },
  ],
  technical: [
    {
      id: 'expert',
      name: '최민수 시니어',
      role: '실무 전문가',
      icon: '🎮',
      style: '솔직하고 직설적',
      description: '시니어 개발자/기획자 7년차. 기술적 정확성과 실무 적용 가능성을 평가합니다.',
      focus: '기술 정확도, 문제 해결, 실무 적용',
    },
    {
      id: 'coach',
      name: '이서연 코치',
      role: '면접 코치',
      icon: '📋',
      style: '격려와 코칭 중심',
      description: '커리어 코칭 전문가 10년차. 답변 구조와 전달력을 분석하고 개선 방향을 제시합니다.',
      focus: '답변 구조, 표현력, 면접 기본기',
    },
    {
      id: 'executive',
      name: '박정우 이사',
      role: '임원 면접관',
      icon: '🏢',
      style: '전략적, 큰 그림',
      description: '이사급 임원 15년차. 성장 가능성과 조직 적합성을 종합적으로 판단합니다.',
      focus: '성장 가능성, 가치관, 장기 비전',
    },
  ],
}

export function getEvaluators(track) {
  return track === 'behavioral' ? EVALUATORS.behavioral : EVALUATORS.technical
}
