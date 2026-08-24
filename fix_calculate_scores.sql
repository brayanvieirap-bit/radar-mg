-- fix_calculate_scores.sql
-- Corrige a inconsistência entre score=50 e band="baixo" quando só um
-- município tem dado pra uma persona (raw_max = raw_min).
-- Rode este arquivo INTEIRO no SQL Editor do Supabase.

create or replace function calculate_scores()
returns void
language plpgsql
as $$
declare
  p persona_type;
  raw_max numeric;
  raw_min numeric;
begin
  foreach p in array enum_range(null::persona_type) loop

    create temporary table tmp_raw as
    select
      rs.municipio_id,
      sum(coalesce(rs.value_numeric, 1) * sw.weight) as raw_score,
      (array_agg(rs.title order by sw.weight desc))[1] as top_signal
    from raw_signals rs
    join scoring_weights sw
      on sw.persona = p
     and sw.source = rs.source
     and sw.signal_type = rs.signal_type
    where rs.published_at >= (current_date - interval '180 days')
    group by rs.municipio_id;

    select max(raw_score), min(raw_score) into raw_max, raw_min from tmp_raw;

    insert into scores (municipio_id, persona, score, band, top_signal, computed_at)
    select
      s.municipio_id,
      p,
      s.score,
      case
        when s.score >= 70 then 'alto'::potential_band
        when s.score >= 40 then 'medio'::potential_band
        else 'baixo'::potential_band
      end as band,
      s.top_signal,
      now()
    from (
      select
        t.municipio_id,
        round(
          case when raw_max = raw_min then 50
          else ((t.raw_score - raw_min) / (raw_max - raw_min)) * 100 end
        , 1) as score,
        t.top_signal
      from tmp_raw t
    ) s
    on conflict (municipio_id, persona)
    do update set
      score = excluded.score,
      band = excluded.band,
      top_signal = excluded.top_signal,
      computed_at = excluded.computed_at;

    drop table tmp_raw;
  end loop;
end;
$$;

select calculate_scores();
