-- Normalized editor state: parts + store stock lengths + kerf (per project)

alter table public.projects
  add column if not exists kerf_mm double precision not null default 0;

create table if not exists public.project_parts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  sort_order int not null,
  client_row_id text not null,
  height_cm text not null default '',
  width_cm text not null default '',
  length_cm text not null default '',
  quantity text not null default '',
  name text not null default '',
  unique (project_id, sort_order)
);

create index if not exists project_parts_project_id_idx on public.project_parts (project_id);

create table if not exists public.project_stock_lengths (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  material_key text not null default '',
  sort_order int not null,
  length_cm int not null,
  unique (project_id, material_key, sort_order)
);

create index if not exists project_stock_lengths_project_id_idx on public.project_stock_lengths (project_id);

-- RLS
alter table public.project_parts enable row level security;
alter table public.project_stock_lengths enable row level security;

drop policy if exists "project_parts_own" on public.project_parts;
create policy "project_parts_own"
on public.project_parts
for all
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_parts.project_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_parts.project_id and p.user_id = auth.uid()
  )
);

drop policy if exists "project_stock_lengths_own" on public.project_stock_lengths;
create policy "project_stock_lengths_own"
on public.project_stock_lengths
for all
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_stock_lengths.project_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_stock_lengths.project_id and p.user_id = auth.uid()
  )
);

-- Atomic save (bypasses RLS via security definer; ownership checked inside)
create or replace function public.save_project_editor_state(
  p_project_id uuid,
  p_kerf_mm double precision,
  p_parts jsonb,
  p_default_lengths int[],
  p_material_overrides jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  r record;
  i int;
  n int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.user_id = v_uid
  ) then
    raise exception 'Project not found';
  end if;

  update public.projects
  set kerf_mm = greatest(0::double precision, coalesce(p_kerf_mm, 0))
  where id = p_project_id;

  delete from public.project_parts where project_id = p_project_id;

  if p_parts is not null and jsonb_typeof(p_parts) = 'array' then
    insert into public.project_parts (
      project_id, sort_order, client_row_id,
      height_cm, width_cm, length_cm, quantity, name
    )
    select
      p_project_id,
      (t.ord - 1)::int,
      coalesce(t.elem->>'id', gen_random_uuid()::text),
      coalesce(t.elem->>'heightCm', ''),
      coalesce(t.elem->>'widthCm', ''),
      coalesce(t.elem->>'lengthCm', ''),
      coalesce(t.elem->>'quantity', ''),
      coalesce(t.elem->>'name', '')
    from jsonb_array_elements(p_parts) with ordinality as t(elem, ord);
  end if;

  delete from public.project_stock_lengths where project_id = p_project_id;

  if p_default_lengths is not null and coalesce(array_length(p_default_lengths, 1), 0) > 0 then
    insert into public.project_stock_lengths (project_id, material_key, sort_order, length_cm)
    select p_project_id, '', (u.ord - 1)::int, u.x::int
    from unnest(p_default_lengths) with ordinality as u(x, ord);
  end if;

  if p_material_overrides is not null and jsonb_typeof(p_material_overrides) = 'object' then
    for r in select key as mat_key, value as arr from jsonb_each(p_material_overrides) loop
      if r.mat_key is null or r.mat_key = '' then
        continue;
      end if;
      if jsonb_typeof(r.arr) <> 'array' then
        continue;
      end if;
      n := jsonb_array_length(r.arr);
      if n is null or n <= 0 then
        continue;
      end if;
      for i in 0 .. n - 1 loop
        insert into public.project_stock_lengths (project_id, material_key, sort_order, length_cm)
        values (
          p_project_id,
          r.mat_key,
          i,
          (r.arr->>i)::int
        );
      end loop;
    end loop;
  end if;
end;
$$;

grant execute on function public.save_project_editor_state(
  uuid, double precision, jsonb, int[], jsonb
) to authenticated;

-- Backfill from legacy projects.data (jsonb), only when new tables are still empty
update public.projects pr
set kerf_mm = greatest(0::double precision, (pr.data->>'kerfMm')::double precision)
where jsonb_typeof(pr.data) = 'object'
  and pr.data ? 'kerfMm'
  and (pr.data->>'kerfMm') ~ '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$';

insert into public.project_parts (
  project_id, sort_order, client_row_id,
  height_cm, width_cm, length_cm, quantity, name
)
select
  pr.id,
  (t.ord - 1)::int,
  coalesce(t.elem->>'id', gen_random_uuid()::text),
  coalesce(t.elem->>'heightCm', ''),
  coalesce(t.elem->>'widthCm', ''),
  coalesce(t.elem->>'lengthCm', ''),
  coalesce(t.elem->>'quantity', ''),
  coalesce(t.elem->>'name', '')
from public.projects pr
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(pr.data->'rows') = 'array' then pr.data->'rows'
    else '[]'::jsonb
  end
) with ordinality as t(elem, ord)
where not exists (select 1 from public.project_parts pp where pp.project_id = pr.id);

insert into public.project_stock_lengths (project_id, material_key, sort_order, length_cm)
select
  pr.id,
  '',
  (u.ord - 1)::int,
  round((u.elem #>> '{}')::numeric)::int
from public.projects pr
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(pr.data->'storeStockLengthsCm') = 'array' then pr.data->'storeStockLengthsCm'
    else '[]'::jsonb
  end
) with ordinality as u(elem, ord)
where not exists (
  select 1 from public.project_stock_lengths s
  where s.project_id = pr.id and s.material_key = ''
);

insert into public.project_stock_lengths (project_id, material_key, sort_order, length_cm)
select
  pr.id,
  e.mat_key,
  (o.ord - 1)::int,
  round((o.elem #>> '{}')::numeric)::int
from public.projects pr
cross join lateral jsonb_each(
  case
    when jsonb_typeof(pr.data->'storeStockLengthsByMaterial') = 'object'
    then pr.data->'storeStockLengthsByMaterial'
    else '{}'::jsonb
  end
) as e(mat_key, arr)
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(e.arr) = 'array' then e.arr else '[]'::jsonb end
) with ordinality as o(elem, ord)
where e.mat_key <> ''
  and not exists (
    select 1 from public.project_stock_lengths s
    where s.project_id = pr.id and s.material_key = e.mat_key
  );
