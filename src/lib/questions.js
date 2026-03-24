import commonQuestions from '../data/questions/common.json'
import behavioralQuestions from '../data/questions/behavioral.json'

/**
 * 트랙별 질문 풀에서 지정 수만큼 반환
 * 자기소개 질문은 항상 첫 번째로 고정
 */
export function getQuestions(count = 4, track = 'behavioral') {
  const pool = track === 'behavioral'
    ? behavioralQuestions.questions
    : commonQuestions.questions

  // 자기소개 질문 찾기 (id에 'intro' 또는 'beh-001' 포함)
  const intro = pool.find((q) => q.id.includes('intro') || q.id === 'beh-001')
  const rest = shuffle(pool.filter((q) => q !== intro))
  const selected = rest.slice(0, Math.max(0, count - (intro ? 1 : 0)))

  return intro ? [intro, ...selected] : selected.slice(0, count)
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
