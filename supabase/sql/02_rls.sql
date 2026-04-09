-- PROMPT 3 — Row Level Security (RLS) for projects

alter table public.projects enable row level security;

-- SELECT own projects
create policy "projects_select_own"
on public.projects
for select
using (auth.uid() = user_id);

-- INSERT only for own user_id
create policy "projects_insert_own"
on public.projects
for insert
with check (auth.uid() = user_id);

-- UPDATE only own projects
create policy "projects_update_own"
on public.projects
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- DELETE only own projects
create policy "projects_delete_own"
on public.projects
for delete
using (auth.uid() = user_id);

