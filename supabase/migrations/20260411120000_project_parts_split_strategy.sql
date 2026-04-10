-- אסטרטגיית פיצול חלק ארוך מקורת קטלוג (max-first / symmetric)

alter table public.project_parts
  add column if not exists split_strategy text not null default 'max-first';

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
      height_cm, width_cm, length_cm, quantity, name, split_strategy
    )
    select
      p_project_id,
      (t.ord - 1)::int,
      coalesce(t.elem->>'id', gen_random_uuid()::text),
      coalesce(t.elem->>'heightCm', ''),
      coalesce(t.elem->>'widthCm', ''),
      coalesce(t.elem->>'lengthCm', ''),
      coalesce(t.elem->>'quantity', ''),
      coalesce(t.elem->>'name', ''),
      case
        when coalesce(t.elem->>'splitStrategy', '') = 'symmetric' then 'symmetric'
        else 'max-first'
      end
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
