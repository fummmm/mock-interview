---
name: supabase-operations
description: "Supabase 운영 가이드. PostgreSQL 스키마 관리, RLS 정책 설계, 스토리지 버킷 관리, 쿼타 RPC 작성, Supabase Auth 통합 패턴을 제공한다. backend-dev 에이전트가 Supabase 관련 작업을 수행할 때 참조한다. 'Supabase', 'RLS', '스키마', '쿼타', '스토리지', 'PostgreSQL', 'DB 마이그레이션', '데이터베이스' 키워드에 트리거된다. 단, OpenRouter API나 프론트엔드 컴포넌트는 이 스킬의 범위가 아니다."
---

# Supabase Operations — Supabase 운영 가이드

backend-dev 에이전트가 Supabase 관련 작업을 수행할 때 활용하는 운영 패턴 레퍼런스.

## 대상 에이전트

`backend-dev` — 이 스킬의 패턴을 Supabase 운영에 직접 적용한다.

## 프로젝트 Supabase 구조

```
supabase/
├── schema.sql           # 핵심 테이블 (users, interviews, responses)
├── storage.sql          # 스토리지 버킷 (영상/오디오)
├── quota-rpc.sql        # 쿼타 관리 RPC 함수
├── fix-rls.sql          # RLS 정책
└── update-trigger.sql   # 자동 업데이트 트리거
```

## 스키마 관리 패턴

### 스키마 변경 절차
1. 변경 내용을 새 SQL 파일로 작성 (`supabase/migration_YYYYMMDD_description.sql`)
2. 기존 데이터에 미치는 영향 분석
3. RLS 정책 업데이트 필요 여부 확인
4. 프론트엔드 타입 정의 동기화 필요 여부 확인

### 테이블 설계 컨벤션
| 규칙 | 예시 |
|------|------|
| snake_case 컬럼명 | `interview_sessions`, `user_profiles` |
| timestamps 필수 | `created_at`, `updated_at` |
| soft delete | `deleted_at` nullable timestamp |
| UUID PK | `id uuid default gen_random_uuid()` |
| 외래키 명시 | `user_id uuid references auth.users(id)` |

## RLS 정책 설계

### 기본 원칙
- **모든 테이블에 RLS 활성화** — `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
- **기본 거부**: 정책 없으면 접근 불가
- **최소 권한**: 필요한 최소한의 접근만 허용

### 역할별 정책 패턴

| 역할 | SELECT | INSERT | UPDATE | DELETE |
|------|--------|--------|--------|--------|
| 학생 (본인) | 본인 데이터만 | 본인 레코드만 | 본인 데이터만 | 불가 |
| 관리자 | 전체 | 전체 | 전체 | 전체 |
| 비인증 | 불가 | 불가 | 불가 | 불가 |

### RLS 정책 작성 예시
```sql
-- 학생은 본인 면접만 조회
CREATE POLICY "students_select_own" ON interviews
  FOR SELECT USING (auth.uid() = user_id);

-- 관리자는 전체 조회
CREATE POLICY "admin_select_all" ON interviews
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );
```

## 쿼타 관리 패턴

### RPC 함수 설계
- `check_quota(user_id)` — 잔여 쿼타 확인
- `deduct_quota(user_id)` — 쿼타 1회 차감 (트랜잭션 내 원자적 실행)
- `reset_quota(user_id, amount)` — 관리자 쿼타 재설정

### 쿼타 차감 안전성
```sql
-- 원자적 차감: 동시 요청에도 안전
CREATE OR REPLACE FUNCTION deduct_quota(p_user_id uuid)
RETURNS boolean AS $$
BEGIN
  UPDATE quotas
  SET remaining = remaining - 1, updated_at = now()
  WHERE user_id = p_user_id AND remaining > 0;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 스토리지 관리

### 버킷 구조
| 버킷 | 용도 | 접근 제어 |
|------|------|----------|
| `recordings` | 면접 영상/오디오 | 본인만 업로드/조회 |
| `resumes` | 이력서 PDF | 본인만 업로드/조회 |
| `portfolios` | 포트폴리오 파일 | 본인만 업로드/조회 |

### 스토리지 RLS 예시
```sql
CREATE POLICY "user_files" ON storage.objects
  FOR ALL USING (
    bucket_id = 'recordings'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

## Supabase Auth 통합

### 클라이언트 설정
```javascript
// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### 인증 플로우
1. 로그인 → Supabase Auth → JWT 토큰 발급
2. API 호출 시 토큰 자동 첨부 (Supabase 클라이언트)
3. RLS가 `auth.uid()`로 사용자 식별

## 환경변수

| 변수 | 용도 | 위치 |
|------|------|------|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL | `.env` (프론트) |
| `VITE_SUPABASE_ANON_KEY` | Supabase 익명 키 | `.env` (프론트) |
| `SUPABASE_SERVICE_ROLE_KEY` | 서비스 역할 키 (서버 전용) | Vercel 환경변수 |

## 변경 시 체크리스트

- [ ] 새 테이블/컬럼에 RLS 정책 추가
- [ ] 기존 데이터 마이그레이션 계획
- [ ] 프론트엔드 타입 정의 동기화
- [ ] 스토리지 정책 업데이트 (해당 시)
- [ ] 쿼타 RPC 영향 분석 (해당 시)
