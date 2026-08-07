-- Golai — Migration 0044: capture a PO NUMBER per receiving line (not PO qty)
--
-- Suppliers reliably quote a PO number, but not always a PO quantity, so the
-- verification line now records the PO number instead. grn_lines gains a text
-- po_ref; verify_grn reads it from the lines jsonb. The old numeric qty_po
-- column is left in place for existing rows but is no longer written by the app.
--
-- ADDITIVE ONLY: one nullable column + a body update to verify_grn_impl. The
-- signature stays (uuid, jsonb), so the 0017 module-guard wrapper (verify_grn)
-- is untouched and existing grants/revokes are preserved.

alter table grn_lines add column if not exists po_ref text;
comment on column grn_lines.po_ref is
  'PO number for this received line (text). Replaces the numeric qty_po in the UI.';

create or replace function verify_grn_impl(
  p_grn_id uuid,
  p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status grn_status;
  v_line jsonb;
begin
  select status into v_status from grns
  where id = p_grn_id and tenant_id = current_tenant_id()
  for update;

  if not found then
    raise exception 'GRN not found';
  end if;
  if v_status <> 'DRAFT' then
    raise exception 'GRN is not in DRAFT status';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one line is required';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if coalesce((v_line->>'qty_received')::numeric, -1) < 0 then
      raise exception 'Received quantity missing or negative';
    end if;
    -- Short/excess receipts require a typed reason (PRD smart validation)
    if (v_line->>'qty_invoice') is not null
       and (v_line->>'qty_received')::numeric <> (v_line->>'qty_invoice')::numeric
       and coalesce(trim(v_line->>'variance_reason'), '') = '' then
      raise exception 'Variance between invoice and received qty requires a reason';
    end if;

    insert into grn_lines (
      tenant_id, grn_id, item_id, qty_received, qty_invoice, qty_po, po_ref,
      variance_reason, qc_status, damage_photos, notes
    )
    values (
      current_tenant_id(), p_grn_id,
      (v_line->>'item_id')::uuid,
      (v_line->>'qty_received')::numeric,
      nullif(v_line->>'qty_invoice', '')::numeric,
      nullif(v_line->>'qty_po', '')::numeric,
      nullif(trim(coalesce(v_line->>'po_ref', '')), ''),
      nullif(trim(coalesce(v_line->>'variance_reason', '')), ''),
      coalesce(nullif(v_line->>'qc_status', ''), 'OK')::qc_line_status,
      coalesce(v_line->'damage_photos', '[]'::jsonb),
      nullif(trim(coalesce(v_line->>'notes', '')), '')
    );
  end loop;

  update grns set status = 'VERIFIED', updated_at = now() where id = p_grn_id;
end;
$$;
