-- Create a generic RPC to find id by table/column/value
-- Execute this in Supabase SQL Editor (Project -> SQL Editor -> New query)
create or replace function public.find_id_by_value(
        p_table text,
        p_column text,
        p_value text
    ) returns bigint language plpgsql as $$
declare id_result bigint;
sql text;
begin sql := format(
    'select id from %I where %I = $1 limit 1',
    p_table,
    p_column
);
execute sql into id_result using p_value;
return id_result;
end;
$$;
-- Conceder permissão de execução ao role anon (necessário para chamadas do client)
grant execute on function public.find_id_by_value(text, text, text) to anon;
-- Opcional: conceder também a authenticated
grant execute on function public.find_id_by_value(text, text, text) to authenticated;