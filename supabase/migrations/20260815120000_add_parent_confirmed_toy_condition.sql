alter table public.toy_analysis_item_valuations
  add column base_second_hand_value_denars integer null,
  add column base_value_confidence numeric null,
  add column ai_condition text null,
  add column ai_condition_confidence numeric null,
  add column ai_condition_notes jsonb null,
  add column confirmed_condition text null,
  add column condition_confirmation_type text null,
  add column condition_confirmed_at timestamptz null,
  add column parent_reported_issues jsonb null,
  add column parent_condition_note text null,
  add column condition_adjustment_basis_points integer null,
  add column updated_at timestamptz not null default now(),

  add constraint toy_analysis_item_valuations_base_value_nonnegative
    check (
      base_second_hand_value_denars is null or
      base_second_hand_value_denars >= 0
    ),
  add constraint toy_analysis_item_valuations_base_confidence_valid
    check (
      base_value_confidence is null or
      base_value_confidence between 0 and 1
    ),
  add constraint toy_analysis_item_valuations_ai_condition_valid
    check (
      ai_condition is null or
      ai_condition in ('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'UNKNOWN')
    ),
  add constraint toy_analysis_item_valuations_ai_condition_confidence_valid
    check (
      ai_condition_confidence is null or
      ai_condition_confidence between 0 and 1
    ),
  add constraint toy_analysis_item_valuations_ai_condition_notes_array
    check (
      ai_condition_notes is null or
      jsonb_typeof(ai_condition_notes) = 'array'
    ),
  add constraint toy_analysis_item_valuations_confirmed_condition_valid
    check (
      confirmed_condition is null or
      confirmed_condition in ('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'UNKNOWN')
    ),
  add constraint toy_analysis_item_valuations_confirmation_type_valid
    check (
      condition_confirmation_type is null or
      condition_confirmation_type in ('ACCEPTED_AI', 'CORRECTED')
    ),
  add constraint toy_analysis_item_valuations_confirmation_complete
    check (
      (
        confirmed_condition is null and
        condition_confirmation_type is null and
        condition_confirmed_at is null
      ) or (
        confirmed_condition is not null and
        condition_confirmation_type is not null and
        condition_confirmed_at is not null
      )
    ),
  add constraint toy_analysis_item_valuations_accepted_ai_matches
    check (
      condition_confirmation_type is null or
      condition_confirmation_type <> 'ACCEPTED_AI' or
      (
        ai_condition is not null and
        confirmed_condition = ai_condition
      )
    ),
  add constraint toy_analysis_item_valuations_parent_issues_array
    check (
      parent_reported_issues is null or
      (
        jsonb_typeof(parent_reported_issues) = 'array' and
        parent_reported_issues <@ '["MISSING_PART", "BROKEN_PART", "DOES_NOT_WORK", "HEAVY_WEAR", "OTHER"]'::jsonb
      )
    ),
  add constraint toy_analysis_item_valuations_parent_note_not_blank
    check (
      parent_condition_note is null or
      btrim(parent_condition_note) <> ''
    ),
  add constraint toy_analysis_item_valuations_adjustment_valid
    check (
      condition_adjustment_basis_points is null or
      condition_adjustment_basis_points between -10000 and 10000
    ),
  add constraint toy_analysis_item_valuations_v2_coherent
    check (
      (
        base_second_hand_value_denars is null and
        base_value_confidence is null and
        ai_condition is null and
        ai_condition_confidence is null and
        ai_condition_notes is null and
        confirmed_condition is null and
        condition_confirmation_type is null and
        condition_confirmed_at is null and
        parent_reported_issues is null and
        parent_condition_note is null and
        condition_adjustment_basis_points is null
      ) or (
        base_second_hand_value_denars is not null and
        ai_condition is not null and
        ai_condition_notes is not null and
        condition_adjustment_basis_points is not null
      )
    );

create trigger toy_analysis_item_valuations_set_updated_at
before update on public.toy_analysis_item_valuations
for each row
execute function public.set_updated_at();
