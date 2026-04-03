import DeviceDropdown from '../DeviceDropdown'

export default function ReadyPhase({
  videoRef,
  mediaStatus,
  audioLevel,
  devices,
  stream,
  switchDevice,
  onStart,
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">카메라 / 마이크 점검</h1>
          <p className="text-text-secondary">
            아래에서 카메라와 마이크가 정상 작동하는지 확인하세요
          </p>
        </div>

        {/* 캠 프리뷰 */}
        <div
          className="bg-bg-secondary border-border relative overflow-hidden rounded-2xl border"
          style={{ height: '360px' }}
        >
          {mediaStatus === 'granted' ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-text-secondary">카메라를 불러오는 중...</p>
            </div>
          )}
        </div>

        {/* 마이크 테스트 */}
        <div className="bg-bg-card border-border space-y-3 rounded-2xl border p-5">
          <h2 className="text-text-secondary text-sm font-semibold">마이크 테스트</h2>
          <p className="text-text-secondary text-sm">아래 막대가 말할 때 움직이면 정상입니다</p>
          <div className="bg-bg-elevated flex h-10 items-center gap-2 rounded-xl px-4">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="w-1 rounded-full transition-all duration-75"
                style={{
                  height: `${Math.max(4, audioLevel > i / 30 ? 32 : 4)}px`,
                  backgroundColor:
                    audioLevel > i / 30
                      ? i < 21
                        ? '#22c55e'
                        : i < 25
                          ? '#f59e0b'
                          : '#ef4444'
                      : '#ffffff20',
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${audioLevel > 0.05 ? 'bg-success' : 'bg-text-secondary/30'}`}
            />
            <span
              className={`text-sm ${audioLevel > 0.05 ? 'text-success' : 'text-text-secondary'}`}
            >
              {audioLevel > 0.05
                ? '마이크 정상 작동 중'
                : '소리가 감지되지 않습니다 - 마이크를 확인하세요'}
            </span>
          </div>
        </div>

        {/* 기기 선택 */}
        <div className="grid grid-cols-2 gap-3">
          <DeviceDropdown
            label="카메라"
            items={devices.video}
            currentId={stream?.getVideoTracks()[0]?.getSettings()?.deviceId || ''}
            onSelect={(id) => switchDevice(id, null)}
            emptyText="카메라 없음"
          />
          <DeviceDropdown
            label="마이크"
            items={devices.audio}
            currentId={stream?.getAudioTracks()[0]?.getSettings()?.deviceId || ''}
            onSelect={(id) => switchDevice(null, id)}
            emptyText="마이크 없음"
          />
        </div>

        <button
          onClick={onStart}
          className="bg-accent hover:bg-accent-hover w-full cursor-pointer rounded-xl py-4 text-lg font-semibold text-white transition-all"
        >
          준비 완료 - 면접 시작
        </button>
      </div>
    </div>
  )
}
