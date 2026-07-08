-- Golai v1.0 — Migration 0009: stock counts (PRD 4.9) + low-stock alerts (4.10)

-- ---------------------------------------------------------------------------
-- Create a count plan (manager/admin). Scope is informational JSON
-- ({zones: [...], shelves: [...], note}); lines are recorded during execution.
-- ---------------------------------------------------------------------------
create or replace function create_stock_count(
  p_plan_name text,
  p_scope jsonb,
  p_assigned_to uuid
)
returns table (count_id uuid, count_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_number text;
begin
  if current_user_role() not in ('manager', 'admin') then
    raise exception 'Only manager or admin can create count plans';
  end if;

  v_number := 'CNT-' || to_char(now(), 'YYYY-MM') || '-' || lpad(next_sequence('count')::text, 4, '0');

  insert into stock_counts (tenant_id, count_number, plan_name, scope, assigned_to, status, created_by)
  values (current_tenant_id(), v_number, p_plan_name, coalesce(p_scope, '{}'), p_assigned_to,
          'IN_PROGRESS', auth.uid())
  returning id into v_id;

  insert into alerts (tenant_id, alert_type, severity, entity_type, entity_id, message, notified_users)
  values (current_tenant_id(), 'count_assigned', 'info', 'stock_count', v_id,
          'Stock count ' || v_number || ' (' || p_plan_name || ') assigned',
          coalesce(jsonb_build_array(p_assigned_to), '[]'));

  return query select v_id, v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Record one counted line. Snapshots system qty at count time; variance is a
-- generated column. Same shelf+item recount replaces the previous line.
-- ---------------------------------------------------------------------------
create or replace function record_count_line(
  p_count_id uuid,
  p_shelf_id uuid,
  p_item_id uuid,
  p_physical_qty numeric,
  p_reason_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status count_status;
  v_system numeric;
begin
  select status into v_status from stock_counts
  where id = p_count_id and tenant_id = current_tenant_id()
  for update;

  if not found then
    raise exception 'Stock count not found';
  end if;
  if v_status <> 'IN_PROGRESS' then
    raise exception 'Count is not in progress';
  end if;
  if p_physical_qty < 0 then
    raise exception 'Physical quantity cannot be negative';
  end if;

  select coalesce(qty_on_hand, 0) into v_system
  from stock_balances
  where shelf_id = p_shelf_id and item_id = p_item_id;
  v_system := coalesce(v_system, 0);

  delete from stock_count_lines
  where stock_count_id = p_count_id and shelf_id = p_shelf_id and item_id = p_item_id;

  insert into stock_count_lines (tenant_id, stock_count_id, shelf_id, item_id,
                                 system_qty, physical_qty, reason_code)
  values (current_tenant_id(), p_count_id, p_shelf_id, p_item_id,
          v_system, p_physical_qty, p_reason_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- Storekeeper finishes counting → COMPLETED (awaiting manager review).
-- ---------------------------------------------------------------------------
create or replace function complete_stock_count(p_count_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update stock_counts set status = 'COMPLETED', updated_at = now()
  where id = p_count_id and tenant_id = current_tenant_id() and status = 'IN_PROGRESS';
  if not found then
    raise exception 'Count not found or not in progress';
  end if;

  insert into alerts (tenant_id, alert_type, severity, entity_type, entity_id, message)
  select tenant_id, 'count_review', 'info', 'stock_count', id,
         'Stock count ' || count_number || ' completed — variances need review'
  from stock_counts where id = p_count_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Manager decision. Approve: every variance becomes an APPROVED adjustment
-- and stock moves to match physical reality. Reject: back to IN_PROGRESS
-- (count must be redone, PRD step 67).
-- ---------------------------------------------------------------------------
create or replace function decide_stock_count(
  p_count_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status count_status;
  v_line record;
begin
  if current_user_role() not in ('manager', 'admin') then
    raise exception 'Only manager or admin can approve counts';
  end if;

  select status into v_status from stock_counts
  where id = p_count_id and tenant_id = current_tenant_id()
  for update;

  if not found then
    raise exception 'Stock count not found';
  end if;
  if v_status <> 'COMPLETED' then
    raise exception 'Count is not awaiting review';
  end if;

  if not p_approve then
    update stock_counts set status = 'IN_PROGRESS', updated_at = now() where id = p_count_id;
    return;
  end if;

  for v_line in
    select * from stock_count_lines
    where stock_count_id = p_count_id and variance <> 0
  loop
    perform move_stock(v_line.item_id, v_line.shelf_id, v_line.variance);
    insert into adjustments (tenant_id, item_id, shelf_id, qty_change, reason_code,
                             reason_note, adjusted_by, approved_by, status)
    values (current_tenant_id(), v_line.item_id, v_line.shelf_id, v_line.variance,
            coalesce(v_line.reason_code, 'count_variance'),
            'From stock count', auth.uid(), auth.uid(), 'APPROVED');
  end loop;

  update stock_counts set status = 'APPROVED', updated_at = now() where id = p_count_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Low-stock / out-of-stock alerts: fires when an item's total on-hand crosses
-- its reorder point. Deduped against existing unread alerts.
-- ---------------------------------------------------------------------------
create or replace function check_reorder_point()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_item items%rowtype;
begin
  select * into v_item from items where id = new.item_id;
  if v_item.reorder_point is null then
    return new;
  end if;

  select coalesce(sum(qty_on_hand), 0) into v_total
  from stock_balances where item_id = new.item_id;

  if v_total <= v_item.reorder_point then
    if not exists (
      select 1 from alerts
      where tenant_id = new.tenant_id
        and alert_type in ('low_stock', 'out_of_stock')
        and entity_type = 'item' and entity_id = new.item_id
        and status = 'UNREAD'
    ) then
      insert into alerts (tenant_id, alert_type, severity, entity_type, entity_id, message)
      values (
        new.tenant_id,
        case when v_total = 0 then 'out_of_stock' else 'low_stock' end,
        case when v_total = 0 then 'critical' else 'warning' end,
        'item', new.item_id,
        v_item.name || ' (' || v_item.code || '): ' ||
        case when v_total = 0 then 'OUT OF STOCK'
             else 'low stock — ' || v_total || ' ' || v_item.uom || ' left (reorder at ' || v_item.reorder_point || ')' end
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger stock_balances_reorder_check
  after insert or update of qty_on_hand on stock_balances
  for each row execute function check_reorder_point();
