import commonQuestions from '../data/questions/common.json'

/**
 * 질문 풀에서 지정 수만큼 반환
 * 자기소개(beh-001)는 항상 첫 질문으로 고정
 */
export function getQuestions(count = 4) {
  const all = commonQuestions.questions
  const intro = all.find((q) => q.id === 'beh-001')
  const rest = shuffle(all.filter((q) => q.id !== 'beh-001'))
  const selected = rest.slice(0, Math.max(0, count - 1))
  return intro ? [intro, ...selected] : selected
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
