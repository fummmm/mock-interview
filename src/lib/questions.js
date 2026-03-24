import commonQuestions from '../data/questions/common.json'

/**
 * 질문 풀에서 랜덤 셔플하여 지정 수만큼 반환
 */
export function getQuestions(count = 4) {
  const all = commonQuestions.questions
  const shuffled = shuffle(all)
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
