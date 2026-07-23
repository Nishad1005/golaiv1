-- Golai — Migration 0024: give item-code allocation its own guarded door
--
-- Regression from 0017. That migration revoked next_sequence() from clients so
-- a crafted API call could not bump the audit-critical document sequences (GRN,
-- ISS, DC, …) out of band. But item-code allocation calls next_sequence
-- directly from the browser — it is the one sequence a client legitimately
-- needs to advance — so importing any product without a code now fails with
-- "permission denied for function next_sequence".
--
-- The fix is NOT to hand next_sequence back to clients — that would reopen the
-- document-numbering hole. It is a narrow wrapper that advances ONLY the
-- item_code sequence, and only for someone allowed to create items.

-- ---------------------------------------------------------------------------
-- Batch allocation — reserve N consecutive codes in one atomic step
--
-- The importer needs one code per un-coded row. Allocating them one round-trip
-- at a time turned a 500-item file into 500 network calls; this reserves the
-- whole block at once and returns them formatted, so the format lives in one
-- place (here) rather than being reassembled on the client.
-- ---------------------------------------------------------------------------
create or replace function next_item_codes(p_count integer)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start bigint;
  v_codes text[];
begin
  -- Creating items is allowed from the Items admin screen (import / manual) and
  -- from Capture (an unknown product scanned on the floor). Anyone who can do
  -- either can allocate a code; nobody else can touch the sequence.
  if not (has_module('admin_items') or has_module('capture')) then
    raise exception 'You do not have permission to create items';
  end if;

  if p_count is null or p_count < 1 then
    return '{}';
  end if;
  -- Defensive cap: a code block only ever creates gaps in ITM- numbering, but
  -- there is no legitimate reason to reserve a runaway count in one call.
  if p_count > 50000 then
    raise exception 'Too many codes requested at once (%).', p_count;
  end if;

  insert into sequences (tenant_id, sequence_name, current_value)
  values (current_tenant_id(), 'item_code', 0)
  on conflict (tenant_id, sequence_name) do nothing;

  update sequences
     set current_value = current_value + p_count,
         updated_at = now()
   where tenant_id = current_tenant_id()
     and sequence_name = 'item_code'
   returning current_value - p_count into v_start;  -- value before the bump

  select array_agg('ITM-' || lpad((v_start + g)::text, 5, '0') order by g)
    into v_codes
    from generate_series(1, p_count) as g;

  return v_codes;
end;
$$;

-- Single allocation — the manual "add one item" and create-on-scan paths.
create or replace function next_item_code()
returns text
language sql
security definer
set search_path = public
as $$
  select (next_item_codes(1))[1];
$$;

revoke all on function next_item_codes(integer) from public, anon;
revoke all on function next_item_code() from public, anon;
grant execute on function next_item_codes(integer) to authenticated;
grant execute on function next_item_code() to authenticated;

comment on function next_item_codes(integer) is
  'Reserves N consecutive ITM- item codes atomically. Guarded: caller must be '
  'able to create items (admin_items or capture). Does not touch document '
  'sequences.';
