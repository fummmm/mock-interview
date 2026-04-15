/**
 * 이력서 블록 컴포넌트 정의
 * 원본 DEFS 객체를 React 컴포넌트로 변환
 */

// contentEditable 헬퍼
function CE({ className = '', children, style = {} }) {
  return (
    <div className={className} contentEditable suppressContentEditableWarning spellCheck={false} style={{ color: 'inherit', ...style }}>
      {children}
    </div>
  )
}

// === 기본 정보 ===
function HeaderVertical() {
  return (
    <>
      <CE className="rb-title font-bold">이름</CE>
      <CE className="text-sm mt-1" style={{ color: 'var(--accent)' }}>직무 타이틀 | 기술 스택</CE>
      <div className="mt-3 space-y-1 text-xs opacity-70">
        <div className="flex gap-2"><span className="font-medium w-12">이메일</span><CE>email@example.com</CE></div>
        <div className="flex gap-2"><span className="font-medium w-12">전화</span><CE>010-0000-0000</CE></div>
        <div className="flex gap-2"><span className="font-medium w-12">GitHub</span><CE>github.com/username</CE></div>
      </div>
    </>
  )
}

function HeaderHorizontal() {
  return (
    <div className="flex justify-between items-start">
      <div>
        <CE className="rb-title font-bold">이름</CE>
        <CE className="text-sm mt-1" style={{ color: 'var(--accent)' }}>직무 타이틀</CE>
      </div>
      <div className="text-right text-xs opacity-70 space-y-0.5">
        <CE>email@example.com</CE>
        <CE>010-0000-0000</CE>
        <CE>github.com/username</CE>
      </div>
    </div>
  )
}

function HeaderMinimal() {
  return (
    <div className="text-center">
      <CE className="rb-title font-bold">이름</CE>
      <CE className="text-xs opacity-60 mt-1">email@example.com | 010-0000-0000 | github.com/username</CE>
    </div>
  )
}

// === 사진 ===
import { useRef } from 'react'

function PhotoCircle({ block, updateBlock }) {
  const inputRef = useRef(null)
  const handleUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => updateBlock(block.id, { content: { ...block.content, photoSrc: reader.result } })
    reader.readAsDataURL(file)
  }
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 120 }}>
      <div
        className="overflow-hidden bg-gray-100 flex items-center justify-center cursor-pointer"
        style={{ width: 120, height: 120, borderRadius: '50%' }}
        onClick={() => inputRef.current?.click()}
      >
        {block.content?.photoSrc ? (
          <img src={block.content.photoSrc} alt="사진" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs opacity-40">클릭하여 사진 추가</span>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </div>
  )
}

function PhotoSquare({ block, updateBlock }) {
  const inputRef = useRef(null)
  const handleUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => updateBlock(block.id, { content: { ...block.content, photoSrc: reader.result } })
    reader.readAsDataURL(file)
  }
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 120 }}>
      <div
        className="overflow-hidden bg-gray-100 flex items-center justify-center cursor-pointer"
        style={{ width: 120, height: 150, borderRadius: 8 }}
        onClick={() => inputRef.current?.click()}
      >
        {block.content?.photoSrc ? (
          <img src={block.content.photoSrc} alt="사진" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs opacity-40">클릭하여 사진 추가</span>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </div>
  )
}

function PhotoBanner({ block, updateBlock }) {
  const inputRef = useRef(null)
  const handleUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => updateBlock(block.id, { content: { ...block.content, photoSrc: reader.result } })
    reader.readAsDataURL(file)
  }
  return (
    <div
      className="w-full bg-gray-100 flex items-center justify-center cursor-pointer overflow-hidden"
      style={{ minHeight: 80, borderRadius: 4 }}
      onClick={() => inputRef.current?.click()}
    >
      {block.content?.photoSrc ? (
        <img src={block.content.photoSrc} alt="배너" className="w-full h-full object-cover" />
      ) : (
        <span className="text-xs opacity-40">클릭하여 배너 이미지 추가</span>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </div>
  )
}

// === 한 줄 소개 ===
function SummaryBasic() {
  return <CE className="text-sm leading-relaxed opacity-80">한 줄 소개를 작성하세요. 본인의 핵심 역량과 지원 동기를 간결하게 표현합니다.</CE>
}

function SummaryQuote() {
  return (
    <div className="border-l-3 pl-3" style={{ borderColor: 'var(--accent)' }}>
      <CE className="text-sm italic opacity-80 leading-relaxed">"한 줄 소개를 작성하세요."</CE>
    </div>
  )
}

function SummaryAccent() {
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 8%, white)' }}>
      <CE className="text-sm leading-relaxed opacity-80">한 줄 소개를 작성하세요.</CE>
    </div>
  )
}

// === 기술 스택 ===
function SkillTag() {
  return (
    <div>
      <div className="text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>기술 스택</div>
      <div className="flex flex-wrap gap-1.5">
        {['Unity', 'C#', 'Git', 'Jira'].map((s) => (
          <CE key={s} className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs opacity-80">{s}</CE>
        ))}
      </div>
    </div>
  )
}

function SkillCategory() {
  return (
    <div>
      <div className="text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>기술 스택</div>
      <div className="space-y-1.5 text-xs">
        <div><span className="font-medium opacity-80">엔진</span> <CE className="inline opacity-60">Unity, Unreal Engine</CE></div>
        <div><span className="font-medium opacity-80">언어</span> <CE className="inline opacity-60">C#, C++, Blueprint</CE></div>
        <div><span className="font-medium opacity-80">도구</span> <CE className="inline opacity-60">Git, Jira, Notion</CE></div>
      </div>
    </div>
  )
}

// === 프로젝트 ===
function ProjectDetail() {
  return (
    <div>
      <div className="text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>프로젝트</div>
      <div className="space-y-3">
        <div>
          <div className="flex justify-between items-baseline">
            <CE className="font-medium text-sm opacity-90">프로젝트명</CE>
            <CE className="text-xs opacity-50">2025.01 ~ 2025.03</CE>
          </div>
          <CE className="text-xs opacity-60 mt-0.5">역할 / 팀 구성</CE>
          <CE className="text-xs opacity-70 mt-1 leading-relaxed">프로젝트 설명과 본인의 기여를 작성하세요.</CE>
        </div>
      </div>
    </div>
  )
}

function ProjectCard() {
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <CE className="font-medium text-sm opacity-90">프로젝트명</CE>
      <CE className="text-xs opacity-50 mt-0.5">2025.01 ~ 2025.03</CE>
      <CE className="text-xs opacity-70 mt-2 leading-relaxed">프로젝트 설명을 작성하세요.</CE>
    </div>
  )
}

function ProjectMinimal() {
  return (
    <div>
      <CE className="font-medium text-sm opacity-90">프로젝트명</CE>
      <CE className="text-xs opacity-70 mt-1 leading-relaxed">한 줄 설명</CE>
    </div>
  )
}

// === 학력 ===
function EducationVertical() {
  return (
    <div>
      <div className="text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>학력</div>
      <div>
        <CE className="font-medium text-sm opacity-90">OO대학교 컴퓨터공학과</CE>
        <CE className="text-xs opacity-50">2018.03 ~ 2024.02 (졸업)</CE>
      </div>
    </div>
  )
}

function EducationHorizontal() {
  return (
    <div>
      <div className="text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>학력</div>
      <div className="flex justify-between items-baseline">
        <CE className="font-medium text-sm opacity-90">OO대학교 컴퓨터공학과</CE>
        <CE className="text-xs opacity-50">2018 ~ 2024</CE>
      </div>
    </div>
  )
}

// === 경력 ===
function ExperienceVertical() {
  return (
    <div>
      <div className="text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>경력</div>
      <div>
        <div className="flex justify-between items-baseline">
          <CE className="font-medium text-sm opacity-90">회사명</CE>
          <CE className="text-xs opacity-50">2023.01 ~ 현재</CE>
        </div>
        <CE className="text-xs mt-0.5" style={{ color: 'var(--accent)' }}>직무 / 직급</CE>
        <CE className="text-xs opacity-70 mt-1 leading-relaxed">담당 업무를 작성하세요.</CE>
      </div>
    </div>
  )
}

function ExperienceTimeline() {
  return (
    <div>
      <div className="text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>경력</div>
      <div className="border-l-2 pl-3 ml-1" style={{ borderColor: 'var(--accent)' }}>
        <CE className="font-medium text-sm opacity-90">회사명</CE>
        <CE className="text-xs opacity-50">2023.01 ~ 현재</CE>
        <CE className="text-xs opacity-70 mt-1 leading-relaxed">담당 업무를 작성하세요.</CE>
      </div>
    </div>
  )
}

// === 자격증/수상 ===
function CertList() {
  return (
    <div>
      <div className="text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>자격증 / 수상</div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between"><CE className="opacity-80">자격증/수상명</CE><CE className="opacity-50">2025.01</CE></div>
        <div className="flex justify-between"><CE className="opacity-80">자격증/수상명</CE><CE className="opacity-50">2024.06</CE></div>
      </div>
    </div>
  )
}

function CertBadge() {
  return (
    <div>
      <div className="text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>자격증 / 수상</div>
      <div className="flex flex-wrap gap-1.5">
        <CE className="rounded border border-gray-200 px-2 py-0.5 text-xs opacity-80">자격증명</CE>
        <CE className="rounded border border-gray-200 px-2 py-0.5 text-xs opacity-80">수상명</CE>
      </div>
    </div>
  )
}

// === 포트폴리오 링크 ===
function LinkRow() {
  return (
    <div>
      <div className="text-sm font-semibold mb-2" style={{ color: 'var(--accent)' }}>포트폴리오 / 링크</div>
      <div className="space-y-1 text-xs">
        <div className="flex gap-2"><CE className="font-medium" style={{ color: 'var(--accent)' }}>GitHub</CE><CE className="opacity-60">github.com/username</CE></div>
        <div className="flex gap-2"><CE className="font-medium" style={{ color: 'var(--accent)' }}>Portfolio</CE><CE className="opacity-60">portfolio.notion.site</CE></div>
      </div>
    </div>
  )
}

// === 색 블록 ===
function ColorSolid({ block }) {
  return <div className="w-full h-full min-h-[40px]" style={{ backgroundColor: block?.accent || 'var(--accent)' }} />
}

function ColorGradient({ block }) {
  const c = block?.accent || '#E8344E'
  return <div className="w-full h-full min-h-[40px]" style={{ background: `linear-gradient(135deg, ${c}, ${c}88)` }} />
}

// === 구분선 ===
function DividerSolid() {
  return <hr className="border-t-2" style={{ borderColor: 'var(--accent)' }} />
}

function DividerDash() {
  return <hr className="border-t-2 border-dashed" style={{ borderColor: 'var(--accent)' }} />
}

function DividerDots() {
  return <hr className="border-t-2 border-dotted" style={{ borderColor: 'var(--accent)' }} />
}

// === 블록 정의 레지스트리 ===
export const BLOCK_DEFS = {
  // 기본 정보
  'hd-v': { label: '세로형', group: '기본 정보', icon: '👤', w: 460, component: HeaderVertical },
  'hd-h': { label: '가로형', group: '기본 정보', icon: '👤', w: 540, component: HeaderHorizontal },
  'hd-min': { label: '미니멀형', group: '기본 정보', icon: '👤', w: 520, component: HeaderMinimal },

  // 사진
  'ph-circle': { label: '원형', group: '사진', icon: '📷', w: 160, h: 160, component: PhotoCircle },
  'ph-square': { label: '사각형', group: '사진', icon: '📷', w: 160, h: 190, component: PhotoSquare },
  'ph-banner': { label: '배너', group: '사진', icon: '📷', w: 500, h: 120, component: PhotoBanner },

  // 한 줄 소개
  'sum-basic': { label: '기본', group: '한 줄 소개', icon: '💬', w: 460, component: SummaryBasic },
  'sum-quote': { label: '인용구', group: '한 줄 소개', icon: '💬', w: 460, component: SummaryQuote },
  'sum-accent': { label: '강조', group: '한 줄 소개', icon: '💬', w: 460, component: SummaryAccent },

  // 기술 스택
  'sk-tag': { label: '태그', group: '기술 스택', icon: '🔧', w: 400, component: SkillTag },
  'sk-cat': { label: '카테고리', group: '기술 스택', icon: '🔧', w: 400, component: SkillCategory },

  // 프로젝트
  'pj-detail': { label: '상세', group: '프로젝트', icon: '📁', w: 500, component: ProjectDetail },
  'pj-card': { label: '카드', group: '프로젝트', icon: '📁', w: 400, component: ProjectCard },
  'pj-min': { label: '미니멀', group: '프로젝트', icon: '📁', w: 400, component: ProjectMinimal },

  // 학력
  'ed-v': { label: '세로', group: '학력', icon: '🎓', w: 400, component: EducationVertical },
  'ed-h': { label: '가로', group: '학력', icon: '🎓', w: 500, component: EducationHorizontal },

  // 경력
  'ex-v': { label: '세로', group: '경력', icon: '💼', w: 460, component: ExperienceVertical },
  'ex-tl': { label: '타임라인', group: '경력', icon: '💼', w: 460, component: ExperienceTimeline },

  // 자격증/수상
  'ct-list': { label: '리스트', group: '자격증/수상', icon: '🏆', w: 400, component: CertList },
  'ct-badge': { label: '뱃지', group: '자격증/수상', icon: '🏆', w: 400, component: CertBadge },

  // 포트폴리오 링크
  'lk-row': { label: '가로', group: '포트폴리오', icon: '🔗', w: 400, component: LinkRow },

  // 색 블록
  'cb-solid': { label: '단색', group: '장식', icon: '🎨', w: 200, h: 60, component: ColorSolid },
  'cb-grad': { label: '그라디언트', group: '장식', icon: '🎨', w: 200, h: 60, component: ColorGradient },

  // 구분선
  'dv-solid': { label: '실선', group: '구분선', icon: '─', w: 400, h: 10, component: DividerSolid },
  'dv-dash': { label: '점선', group: '구분선', icon: '┄', w: 400, h: 10, component: DividerDash },
  'dv-dots': { label: '도트', group: '구분선', icon: '···', w: 400, h: 10, component: DividerDots },
}

// 팔레트 그룹 순서
export const PALETTE_GROUPS = [
  '기본 정보', '사진', '한 줄 소개', '기술 스택', '프로젝트',
  '학력', '경력', '자격증/수상', '포트폴리오', '장식', '구분선',
]
