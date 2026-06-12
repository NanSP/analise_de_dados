Importando CSV para Supabase (server-side)

Objetivo

- Script Node para importar um CSV para seu banco Supabase usando a `service_role` (usuário de servidor).

Pré-requisitos

- Node 18+ instalado
- Dependência `@supabase/supabase-js` já listada em `package.json` (já presente no projeto)

Uso

1. No terminal, execute (substitua valores):

```bash
SUPABASE_URL=https://<seu-projeto>.supabase.co \
SUPABASE_SERVICE_ROLE=<SUA_SERVICE_ROLE_KEY> \
node scripts/import_supabase.js "C:/Users/.../scopus_export.csv"
```

2. O script processará linhas do CSV, criará revistas, autores, keywords e artigos, e fará as junctions.

Segurança

- Nunca exponha a `service_role` no cliente/browser. Use este script somente em ambiente de servidor/trusted.

Logs e erros

- O script mostrará um resumo com contagens e erros encontrados.

Se quiser, eu posso:

- adaptar o script para rodar em ambientes Windows com `.env` via `dotenv`;
- criar um endpoint serverless que execute o import com a `service_role` (ex.: Vercel/Fn/Azure Functions).
