# Relatório de segurança

Data: 12/10/2026
Branch: `seguranca-auth`

## Resumo por severidade

### Alta — exige ação antes da produção

- As migrations 002, 003 e 004 estão em `supabase/migrations/` com sufixo `_PENDENTE_APROVACAO.sql`. Não foram aplicadas. Até aplicação aprovada, o banco continua com as policies e ACLs descritas no snapshot de referência.
- A migration 002 restringe moderação/cargos/convites e fecha escritas diretas que contornam RPCs. A verificação de hierarquia depende do esquema/ACL real e ainda precisa passar os scripts de staging.
- O snapshot contém 38 funções `SECURITY DEFINER` e seis policies `USING (true)`. A migration 003 propõe search path e ACLs para as funções e predicates restritos para essas policies. O teste local comprova a cobertura estática; só o staging confirma os ACLs e resultados de RLS aplicados.
- A migration 004 define políticas e limites de Storage, DMs/Realtime e mensagens, mas requer teste real contra staging antes da aprovação.

### Média — risco residual e integração

- OAuth Spotify usa `state` e PKCE S256. Access/refresh tokens continuam em `localStorage`, sujeitos a leitura por JavaScript de mesma origem em caso de XSS.
- Resgate de convite limita 10 tentativas por usuário em 15 minutos e serializa uso de `max_uses`; o RPC não recebe IP confiável e não tem limite por IP.
- Chat ignora HTML cru em ReactMarkdown e permite destinos HTTPS seguros. O rate limit e tamanho máximo SQL dependem da migration 004 e não foram exercitados no banco.
- Pusher valida sessão/identidade/canal e revalida relacionamento para chamada direta; voice, Realtime, Pusher, Supabase Storage, Spotify e Blob não foram exercitados contra serviços reais.
- Os scripts SQL de staging estão prontos para parametrização, mas não foram executados.

### Baixa — qualidade/avisos

- `npm run lint` passou com avisos existentes de dependências de hooks e `<img>`.
- Build passou com avisos de cache Webpack sem impacto funcional observado.

## Escopo revisado

- Fluxos de autenticação existentes e código novo/alterado de moderação, convites, Pusher, chat, Spotify e Blob.
- Migrations pendentes 002–004, migrations anteriores 001 e snapshot de referência `db/schema-atual-producao.sql`.
- Scripts de staging em `scripts/` e testes automatizados em `tests/`.
- A cópia `db/schema-atual-producao copy.sql` foi preservada sem commit. `desktop/` não foi modificada.
- Não houve push, conexão a banco remoto nem aplicação de migrations. `db/sekai_schema.sql` não foi executado.
- Nenhum `.env*` foi aberto manualmente. Uma primeira tentativa de build local fez o Next informar que carregou `.env.local` automaticamente; nenhum valor foi impresso. Os builds finais foram executados em cópia temporária sem `.env*`.

## Alterações preparadas

- **Autenticação existente:** cadastro público Supabase Auth, confirmação de e-mail, Turnstile, validação de campos, honeypot, senha mínima de 12 caracteres e MFA TOTP permanecem como documentado na etapa anterior. A sessão Supabase continua no `localStorage`; cookies HttpOnly dependem de testes reais de servidor, mensagens, voz e Realtime. Signup não usa `service_role`.
- **Migration 002:** hierarquia estrita para moderação e cargos; bloqueio de autoatribuição; políticas de escrita de canais, cargos, membros, bans e convites; despacho de moderação de uso único; rate limit por usuário para preview/resgate; expiração, `max_uses`, bloqueio de banidos e índices únicos normalizados para códigos de convite. O índice aborta a migration se houver duplicatas preexistentes.
- **Migration 003:** remove o default da sobrecarga `is_server_member(uuid,uuid)` para resolver ambiguidade mantendo a assinatura explícita; aplica `search_path` fixo a funções `SECURITY DEFINER` de `public`; revoga EXECUTE de `PUBLIC`/`anon` e concede os papéis necessários a predicados de policy e RPCs identificados; substitui as seis policies abertas do snapshot.
- **Migration 004:** buckets de Storage com limites de tamanho/MIME e políticas por pasta/permissão; bloqueio de SVG/HTML; bucket privado `chat-images`; políticas de leitura de DMs e broadcast soundboard; mensagens de no máximo 4.000 caracteres e limite transacional de envio.
- **Aplicação:** chat valida URLs Markdown e ignora HTML cru; endpoint Pusher revalida o relacionamento em chamadas diretas; seleção de ícone alinha MIME/tamanho com a policy; Blob usa `handleUploadPresigned`, que no pacote local valida assinatura Ed25519 via `x-vercel-signature` e `BLOB_WEBHOOK_PUBLIC_KEY`; Spotify valida `state` e PKCE.

## Revisão adversarial

- Exercitei com testes de contrato destinos `javascript:`, `data:`, `vbscript:` e HTTP no Markdown: são rejeitados. HTML cru está desativado no ReactMarkdown.
- Os scripts de staging tentam ler dados alheios, operar sobre cargo igual/superior, autoatribuir cargo e gravar em pasta alheia; também tentam SVG/HTML. São scripts para serem executados após aprovação em staging, não resultados de execução.
- A migration 002 é transacional e aborta com códigos normalizados duplicados. A migration 003 é a parte de maior impacto por alterar em lote funções, policies e ACLs. A migration 004 pode mudar acessibilidade de arquivos já carregados.
- Não foi possível fazer revisão dinâmica de RLS, testar concorrência de convite ou verificar todos os fluxos sob roles reais: não havia banco staging autorizado/configurado. Por isso, os artefatos permanecem pendentes e o relatório não declara correção de produção.

## Verificações executadas

- `npm run test`: **23 testes passaram, 0 falharam**, em quatro arquivos (`auth-validation`, `migration-schema-compat`, `request-body`, `security-boundaries`). Inclui comparação estática de relações/colunas do manifesto com o snapshot e verificações de migrations/handlers; não é teste SQL/RLS contra servidor.
- `npm run lint`: passou com avisos de hooks e `<img>`.
- `npx tsc --noEmit --incremental false`: passou.
- `npm run build`: passou em cópia temporária do repo sem `.env*`. Build gerou páginas e rotas; avisos de cache Webpack e lint não impediram a compilação.
- `git diff --check` requer `core.whitespace=cr-at-eol` para respeitar arquivos CRLF; a checagem com essa configuração não encontrou whitespace indevido.
- Não executei SQL de staging, nem testes com Supabase, Vercel Blob, Pusher, Spotify ou voz.

## Próximas ações e rollback

Leia [docs/PENDENCIAS.md](PENDENCIAS.md) para status por item, ações manuais, aprovadores e procedimentos de rollback. Antes de aplicar qualquer migration: duplicatas de convites devem ser resolvidas, UUIDs admin conferidos, backup/PITR validado e scripts executados em staging. Não reverta apenas grants/policies para o estado anterior: isso reabre permissões. Rollback das migrations 002–004 exige restaurar snapshot da etapa imediatamente anterior e reconciliar ações persistidas.
