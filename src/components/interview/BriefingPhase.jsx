export default function BriefingPhase({ isHardMode, questions, evaluators, mediaStatus, onStart }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">
            {isHardMode ? '하드모드 면접을 시작합니다' : '면접을 시작합니다'}
          </h1>
          <p className="text-text-secondary">진행 방식을 확인하고 준비되면 시작해주세요</p>
        </div>

        {/* 진행 안내 */}
        {isHardMode ? (
          <div className="bg-accent/5 border-accent/30 space-y-4 rounded-2xl border-2 p-6">
            <div className="flex items-center gap-2">
              <span className="text-accent text-lg font-bold">HARD MODE</span>
              <span className="bg-accent/15 text-accent rounded-full px-2 py-0.5 text-xs font-medium">
                실전 모드
              </span>
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="bg-accent/15 text-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                  1
                </span>
                <div>
                  <p className="text-sm font-semibold">질문이 타이핑되며 나타납니다</p>
                  <p className="text-text-secondary mt-0.5 text-xs">
                    질문 텍스트가 한 글자씩 표시됩니다
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-accent/15 text-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                  2
                </span>
                <div>
                  <p className="text-sm font-semibold">3초 카운트다운 후 즉시 녹화 시작</p>
                  <p className="text-text-secondary mt-0.5 text-xs">
                    준비할 시간이 없습니다. 타이핑이 끝나면 바로 답변하세요
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-accent/15 text-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                  3
                </span>
                <div>
                  <p className="text-sm font-semibold">질문별 제한시간이 있습니다</p>
                  <p className="text-text-secondary mt-0.5 text-xs">
                    인성 질문 <strong className="text-text-primary">3분</strong> / 기술 질문{' '}
                    <strong className="text-text-primary">5분</strong>
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="bg-accent/15 text-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                  4
                </span>
                <div>
                  <p className="text-sm font-semibold">시간 초과 시 자동으로 다음 질문</p>
                  <p className="text-text-secondary mt-0.5 text-xs">
                    제한시간 내에 답변을 마무리하세요
                  </p>
                </div>
              </div>
            </div>
            <div className="text-text-secondary border-accent/20 flex gap-4 border-t pt-3 text-xs">
              <span>질문 {questions.length}개</span>
              <span>예상 소요 15~25분</span>
            </div>
          </div>
        ) : (
          <div className="bg-bg-card border-border space-y-3 rounded-2xl border p-5">
            <h2 className="text-text-secondary text-sm font-semibold">진행 방식</h2>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2">
                <span className="text-accent shrink-0">1.</span>질문이 화면에 표시되면 충분히 읽고
                생각을 정리하세요
              </li>
              <li className="flex gap-2">
                <span className="text-accent shrink-0">2.</span>준비되면 "답변 시작" 버튼을 눌러
                녹화를 시작하세요
              </li>
              <li className="flex gap-2">
                <span className="text-accent shrink-0">3.</span>답변 후 면접관이 꼬리질문을 할 수
                있습니다
              </li>
              <li className="flex gap-2">
                <span className="text-accent shrink-0">4.</span>모든 질문이 끝나면 AI가 답변을
                분석하여 리포트를 제공합니다
              </li>
            </ul>
            <div className="text-text-secondary border-border/50 flex gap-4 border-t pt-2 text-xs">
              <span>질문 {questions.length}개</span>
              <span>예상 소요 10~15분</span>
            </div>
          </div>
        )}

        {/* 면접관 소개 */}
        <div className="space-y-3">
          <h2 className="text-text-secondary text-sm font-semibold">오늘의 면접관</h2>
          <div
            className={`grid grid-cols-1 gap-3 ${evaluators.length === 2 ? 'sm:grid-cols-2' : evaluators.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}
          >
            {evaluators.map((ev) => (
              <div key={ev.id} className="bg-bg-card border-border space-y-2 rounded-xl border p-4">
                <div>
                  <p className="text-sm font-semibold">{ev.name}</p>
                  <p className="text-text-secondary text-xs">{ev.role}</p>
                </div>
                <p className="text-text-secondary text-xs">{ev.description}</p>
                <p className="text-accent text-xs">평가 중점: {ev.focus}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onStart}
          disabled={mediaStatus !== 'granted'}
          className={`w-full rounded-xl py-4 text-lg font-semibold transition-all ${
            mediaStatus === 'granted'
              ? 'bg-accent hover:bg-accent-hover cursor-pointer text-white'
              : 'bg-bg-elevated text-text-secondary cursor-not-allowed'
          }`}
        >
          {mediaStatus === 'granted' ? '면접 시작' : '카메라/마이크 권한을 허용해주세요'}
        </button>
      </div>
    </div>
  )
}
