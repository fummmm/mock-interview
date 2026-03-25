/**
 * 면접관 + 코치 페르소나 정의
 * 면접관: 채점 + 꼬리질문 (면접 중 활동)
 * 코치: 리포트에서 종합 코칭 (채점 안 함)
 */

export const EVALUATORS = {
  behavioral: [
    {
      id: 'team_lead',
      name: '현직 팀장',
      role: '업계 팀장급',
      icon: '💼',
      style: '솔직하고 실무적',
      description: '경력 5년차. 실무 역량과 팀 적합성을 냉정하게 평가합니다.',
      focus: '실무 경험, 문제 해결력, 팀워크',
    },
    {
      id: 'hr',
      name: 'HR 담당자',
      role: '인사 매니저',
      icon: '👔',
      style: '따뜻하지만 핵심을 짚는',
      description: '경력 4년차. 인성, 조직 문화 적합성, 소통 능력을 평가합니다.',
      focus: '인성, 태도, 소통 능력, 조직 적합성',
    },
    {
      id: 'executive',
      name: '임원 면접관',
      role: '이사/본부장급',
      icon: '🏢',
      style: '전략적, 큰 그림',
      description: '경력 10년차. 성장 가능성과 조직 적합성을 종합적으로 판단합니다.',
      focus: '성장 가능성, 가치관, 장기 비전',
    },
  ],
  technical: [
    {
      id: 'expert',
      name: '실무 전문가',
      role: '시니어 개발자/기획자',
      icon: '🎮',
      style: '솔직하고 직설적',
      description: '경력 4년차. 기술적 정확성과 실무 적용 가능성을 평가합니다.',
      focus: '기술 정확도, 문제 해결, 실무 적용',
    },
    {
      id: 'hr',
      name: 'HR 담당자',
      role: '인사 매니저',
      icon: '👔',
      style: '따뜻하지만 핵심을 짚는',
      description: '경력 4년차. 인성, 조직 문화 적합성, 소통 능력을 평가합니다.',
      focus: '인성, 태도, 소통 능력, 조직 적합성',
    },
    {
      id: 'executive',
      name: '임원 면접관',
      role: '이사/본부장급',
      icon: '🏢',
      style: '전략적, 큰 그림',
      description: '경력 10년차. 성장 가능성과 조직 적합성을 종합적으로 판단합니다.',
      focus: '성장 가능성, 가치관, 장기 비전',
    },
  ],
  // 리포트 전용 코치 (채점 안 함, 종합 코칭만)
  coach: {
    id: 'coach',
    name: '면접 코치',
    icon: '📋',
    description: '면접관 평가를 종합하여 앞으로의 개선 방향과 연습 전략을 제시합니다.',
  },
}

export function getEvaluators(track) {
  return track === 'behavioral' ? EVALUATORS.behavioral : EVALUATORS.technical
}

export function getCoach() {
  return EVALUATORS.coach
}
