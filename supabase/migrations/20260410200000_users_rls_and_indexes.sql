-- RLS על public.users + אינדקסים לביצועים (project_parts, projects)

-- =============================================================================
-- 1) Row Level Security — כל משתמש מחובר רואה ומעדכן רק את השורה שלו
--    הטריגר handle_new_auth_user (SECURITY DEFINER) ממשיך לעקוף RLS בהכנסה אחרי הרשמה
-- =============================================================================

alter table public.users enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
on public.users
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own"
on public.users
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
on public.users
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- אין פוליסי DELETE: מחיקת שורה מ-public.users לא נדרשת מהלקוח (מחיקת חשבון ב-auth מטפלת ב-cascade)

-- =============================================================================
-- 2) מחיקת שורת חלק — DELETE WHERE project_id AND client_row_id
-- =============================================================================

create index if not exists project_parts_project_id_client_row_id_idx
  on public.project_parts (project_id, client_row_id);

-- =============================================================================
-- 3) רשימת פרויקטים — WHERE user_id = ? ORDER BY created_at
-- =============================================================================

create index if not exists projects_user_id_created_at_idx
  on public.projects (user_id, created_at);
