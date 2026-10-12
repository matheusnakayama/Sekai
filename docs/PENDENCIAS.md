# Pendências e ações manuais

## AÇÕES MANUAIS PARA O DONO

### Supabase Auth

1. **Signups:** habilite novos cadastros públicos por e-mail/senha. Confirme que a criação não depende de convite nem de provisionamento manual.
2. **Confirmação de e-mail:** deixe a confirmação obrigatória. Configure Site URL com o domínio de produção real. A aplicação só envia callbacks para a origem canônica e os caminhos internos `/` e `/auth/reset-password`.
3. **Redirect URLs:** permita apenas as URLs exatas de produção necessárias, incluindo a raiz e `/auth/reset-password`. Adicione `localhost` apenas em ambiente de desenvolvimento; evite curingas de domínio.
4. **CAPTCHA:** escolha Cloudflare Turnstile (implementado no código), cadastre o site key e o secret no CAPTCHA do Supabase Auth. Configure `TURNSTILE_SITE_KEY` na Vercel com o site key público. Cadastro, login e recuperação ficam bloqueados sem token válido.
5. **SMTP próprio:** configure provedor, host, porta, usuário, senha, remetente e nome da aplicação. Teste confirmação de conta, recuperação e troca de e-mail; limite/envio do SMTP padrão não substitui entrega de produção.
6. **Rate limits:** ajuste os limites por IP dos endpoints Auth (signup, password sign-in, recovery e OTP) a valores conservadores que não bloqueiem usuários reais. Use os limites/cooldowns por usuário/e-mail disponíveis para signup e recuperação. O limite nativo de senha no Auth não permite um limite adicional configurável por e-mail para login por senha; isso continua pendente.
7. **Senha:** defina mínimo de 12 caracteres e ative proteção contra senhas vazadas/comuns no painel (o recurso pode depender do plano). Não exija composição artificial. Teste que o backend rejeite senhas curtas, não apenas a interface.
8. **MFA:** habilite TOTP. Os usuários podem ativar o autenticador em Configurações → Minha conta. A exigência AAL2 de admins só ficará efetiva depois da aprovação e aplicação manual da migration abaixo.

### Migration de banco (aprovação obrigatória)

- Revise `supabase/migrations/20261012000100_auth_security_PENDENTE_APROVACAO.sql`. Ela altera funções `SECURITY DEFINER`, `is_sekai_admin()`, o trigger de `auth.users` e o event trigger que ativa RLS.
- A tabela de allowlist de admins inicia vazia e a função nova passa a negar administração sem UUID cadastrado. Antes de aplicar, identifique os UUIDs Auth dos admins atuais e planeje inseri-los na `public.sekai_platform_admin_allowlist` na mesma janela de manutenção.
- Revise a exigência de AAL2 padrão (`require_admin_mfa = true`) e o processo de recuperação de acesso. A flag pode ser alterada pelo dono via SQL administrativo, não pela API pública.
- As migrations pendentes 003/004 agora propõem mudanças para as duas sobrecargas de `is_server_member` e para cada policy `USING (true)` identificada no snapshot. Não foram aplicadas; confira impacto e rollback abaixo.
- **Não aplique automaticamente:** o arquivo está em `supabase/migrations` para revisão, com sufixo pendente conforme solicitado. Não rode `supabase db push` até aprovação.

### Vercel

- Configure variáveis de produção e preview a partir de `.env.example`, com valores separados por ambiente. São obrigatórios para cadastro `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `TURNSTILE_SITE_KEY` e `SEKAI_SITE_URL`.
- Integrações só de servidor devem ficar sem `NEXT_PUBLIC_`: segredos LiveKit, Pusher, Blob, Metered e TURN. Nunca configure `service_role` no navegador ou no fluxo de signup.
- Configure proteções de deployment para Preview, firewall/rate limit para endpoints públicos e alertas para picos de Auth/Turnstile. Confira se logs não retêm tokens, e-mails ou o conteúdo do honeypot.
- Depois do deploy, valide os redirects do e-mail e inspecione a CSP no domínio real; URLs dos serviços de voz e Supabase devem corresponder às origens usadas em produção.

### DNS e e-mail

- Aponte o domínio de produção à Vercel e confirme TLS/HTTPS antes de liberar signup.
- Publique no DNS os registros SPF, DKIM e DMARC fornecidos pelo SMTP/remetente. Teste entrega e alinhamento para confirmação/recuperação.
- DNSSEC e CAA podem ser habilitados conforme a política do domínio e do provedor de certificados.

## Pendências técnicas e limitações

1. **Sem enumeração temporal:** o texto visível e os caminhos de erro de signup/recuperação são genéricos, mas o browser ainda fala diretamente com Supabase Auth. A aplicação não consegue nivelar o tempo do endpoint remoto. Um proxy precisa validar Zod/honeypot no servidor, igualar respostas e encaminhar o IP original sem confiar em headers forjados; a opção suportada pode exigir chave Auth secreta e testes de rate-limit. Isso não foi implementado para evitar colapsar os limites por IP na saída da Vercel ou introduzir credencial privilegiada sem teste.
2. **Honeypot:** o frontend interrompe o envio e o endpoint registra um evento sem dados pessoais. Um cliente que ignora o frontend pode chamar Supabase Auth diretamente. O CAPTCHA no backend e os limites do Auth são a barreira efetiva.
3. **Limite por e-mail no login:** os limites nativos Supabase limitam tráfego Auth por IP e alguns fluxos por usuário/e-mail; login de senha não oferece limite nativo por e-mail configurável. Não criei contador em memória, que seria facilmente contornado e inconsistente em múltiplas instâncias.
4. **Zod no Auth:** schemas Zod são aplicados no cliente do fluxo direto de Supabase; os handlers Next aplicam Zod e limite de corpo no servidor. O servidor Auth do Supabase aplica sua validação/configuração própria. Para validação Zod obrigatória antes do Auth, é necessário resolver o proxy e preservação de IP da pendência 1.
5. **MFA de admins:** TOTP opcional está na interface e AAL2 é solicitado após o login quando o Auth informa `nextLevel=aal2`. Enforcement em RLS e cadastro de admins só após a migration pendente e seed de UUIDs.
6. **CSP e sessão:** a CSP foi servida e testada localmente com nonce em `script-src`. `style-src 'unsafe-inline'` permanece por causa dos estilos dinâmicos. Sessão continua no `localStorage`; não foi possível testar Supabase, mensagens, voz e Realtime com backend real, então não houve migração para cookies HttpOnly.
7. **Policies e SQL:** a migration pendente 003 substitui as seis policies `USING (true)` do snapshot por predicados de usuário/visibilidade/relacionamento e remove o default da sobrecarga de dois argumentos de `is_server_member`. A migration 001 corrige o SQL dinâmico do event trigger usando `%I` para identificadores obtidos do catálogo. Nenhuma migration foi aplicada.
8. **Dependências e rede:** o build inicial tentou buscar Figtree no Google Fonts e foi bloqueado; removi essa dependência e o build isolado passou. `npm audit` e download/instalação online foram omitidos por falta de rede. A tentativa `npm install --offline` não achou o pacote Zod no cache, embora Zod 4.1.11 já estivesse no lockfile e em `node_modules`; a dependência foi declarada diretamente e verificada localmente.
9. **Serviços reais:** painel Supabase, SMTP, Turnstile, Vercel, DNS, Pusher, LiveKit, Metered e Realtime não foram acessados. Testes reais de signup verificado, recuperação, MFA, mensagens, voz e canais realtime continuam pendentes.

## Resumo priorizado por severidade

- **Alta:** as policies/RPCs de produção ainda não receberam as migrations pendentes 002–004; autorização de moderação, leitura aberta e grants de `SECURITY DEFINER` permanecem como estão no banco até aprovação/aplicação. Migration 001 também aguarda UUIDs da allowlist admin.
- **Média:** migrations, integrações, Pusher/Realtime e scripts RLS não foram testados contra Supabase staging; Spotify mantém refresh/access tokens em `localStorage`.
- **Baixa:** lint passa com avisos preexistentes de hooks e `<img>`; a build mostra avisos de cache Webpack sem falhar.

## Estado dos 9 itens da revisão adicional (12/10/2026)

As alterações abaixo foram revisadas estaticamente e cobertas por testes de contrato do repositório. As migrations continuam **pendentes de aprovação**, nunca foram aplicadas e não foram executadas contra staging; portanto, não há comprovação de resultado no banco real.

1. **Autorização de moderação — proposta pronta para staging, produção pendente.** Migration 002 restringe escritas diretas de canais/categorias, cargos, membros, banimentos e convites a helpers/RPCs. A hierarquia exige posição estritamente maior para agir sobre membro/cargo; impede autoatribuição, edição do cargo padrão e ação sobre o dono por moderador. A rota Pusher consome despacho de uso único criado dentro da RPC autorizada. Testes unitários estáticos conferem os contratos; o script de staging tenta ações contra usuário de cargo igual/superior. Sem staging, a autorização efetiva não está certificada.
2. **`redeem_invite` — proposta pronta para staging, produção pendente.** Migration 002 limita tentativas autenticadas a 10 por usuário por janela de 15 minutos; valida expiração e `max_uses` sob bloqueio da linha do convite; bloqueia banidos e impede seleção ambígua com índice único de código normalizado (a migration aborta se encontrar duplicados). O fallback de `servers.invite_code` foi removido porque a coluna não existe no dump; convites são lidos de `invites.code`. Continua sem limite por IP no RPC e a concorrência só pode ser certificada com teste transacional no staging.
3. **38 funções `SECURITY DEFINER` — proteção proposta; ACL efetiva pendente de staging.** O snapshot de referência tem 38 definições. A migration 003 percorre o catálogo `public`, aplica `search_path` fixo e revoga EXECUTE de `PUBLIC`/`anon`; repõe `authenticated` para predicados RLS e RPCs de produto identificados no código. Um teste estático confirma o baseline e as cláusulas, mas não consulta o ACL após aplicação nem substitui inspeção de cada função em staging.
4. **Policies `USING (true)` — substituições propostas.** As seis policies encontradas no snapshot são removidas nominalmente: catálogo de insígnias passa a exigir sessão, insígnias atribuídas respeitam flags de visibilidade e presença musical fica restrita ao próprio usuário, amizades aceitas ou servidor compartilhado. A policy restritiva de mensagens também repete autorização no `USING` e proíbe marcador de sistema. O teste estático confirma cobertura; falta observar consultas como A/B/anon no staging.
5. **`is_server_member` — proposta e rollback registrados.** A sobrecarga `(uuid, uuid)` perde o argumento default para resolver ambiguidade; a chamada explícita com dois argumentos só consulta o próprio usuário (ou admin). A assinatura de um argumento permanece. Rollback seguro requer restaurar snapshot imediatamente anterior à migration 003, pois a migration também altera corpos de funções, policies e ACLs.
6. **Storage — políticas propostas, aplicação pendente.** Migration 004 define tamanho e MIME para os cinco buckets; restringe gravação/alteração/remoção por pasta do usuário e permissão de servidor/cargo; bloqueia extensões SVG/HTML e mantém `chat-images` privado. Interface de ícones foi alinhada a JPEG/PNG/WebP/GIF e 5 MiB. O script verifica configuração e tenta uploads cruzados/SVG, mas não foi executado; o limite MIME/tamanho da API Storage precisa de teste HTTP no staging.
7. **Realtime, chat, Pusher, Spotify e Blob — alterações locais verificadas parcialmente.** Migration 004 limita mensagem a 4.000 caracteres e 5 envios por 10 segundos com lock transacional; filtra leitura de DMs por participantes e restringe broadcast de soundboard a membros. ReactMarkdown ignora HTML e valida destinos HTTPS. Pusher valida token/identidade/sala, e revalida amizade ou servidor comum em chamada direta. Spotify usa `state` e PKCE S256, mas tokens de acesso/renovação permanecem em `localStorage` (risco XSS). Confirmei no pacote local Vercel Blob que `handleUploadPresigned` verifica `x-vercel-signature` Ed25519 com `BLOB_WEBHOOK_PUBLIC_KEY`; código limita upload a 5 MiB e MIME de imagem. Voz, Realtime e integrações externas não foram testados com serviços reais.
8. **Scripts SQL de staging — preparados, não executados.** `scripts/staging_rls_users.sql` cobre anon, usuário A versus dados/DM do usuário B, hierarquia e autoelevação. `scripts/staging_rls_storage.sql` cobre bucket privado, tentativa de upload em pasta alheia, SVG/HTML por MIME/extension e configuração do bucket. Substitua os UUIDs de exemplo; execute cada script em transação no staging após aplicação aprovada das migrations 002–004.
9. **Documentos e contagem — atualizados.** A suíte executada tem **23 testes** (`npm test`: 23 passaram, 0 falharam). `tests/migration-schema-compat.test.mjs` verifica relações utilizadas em 002–004 e um manifesto de colunas contra o dump, além de `servers.invite_code`, hierarquia e grants. É uma validação estática: não representa teste SQL/RLS contra banco.

### Compatibilidade com `db/schema-atual-producao.sql` (revisão após erro 42703)

- Staging reportou `column "invite_code" does not exist (public.servers)`. Confirmei no dump que `servers` tem `id`, `name`, `icon_url`, `banner_url`, `description`, `owner_id`, `system_channel_id`, `created_at`, mas não `invite_code`. A migration 002 não cria nem usa essa coluna agora: preview e redeem resolvem código apenas por `public.invites.code`. As definições originais de `preview_invite` e `redeem_invite` no dump ainda contêm referências antigas a `servers.invite_code`; elas são substituídas pelas definições da migration 002 quando aplicada.
- `members.is_banned` é uma coluna (não uma função) existente no dump; `public.member_base_permissions`, `public.perm(text)`, `public.has_permission(uuid,text)`, as duas sobrecargas `public.is_server_member`, e as tabelas `member_roles`, `guild_bans` e `server_audit_logs` também existem. `guild_bans.target_role_position` e as tabelas auxiliares de timeout, despacho e rate limit são criadas pela própria migration 002 antes do uso.
- `channel_permission_overwrites` usa `target_type`/`target_id`, não colunas `role_id`/`user_id`; a migration 003 já usa as colunas do dump. A nova suíte confere relações e colunas do manifesto para essa área.
- A semântica confirmada no app é: posição maior representa cargo mais alto (listas descendentes, reordenação atribui posição maior no topo). As comparações requerem posição do ator estritamente maior que a do alvo; igualdade não autoriza.
- Os grants de UPDATE cobrem os payloads atuais: `members` (apelido, avatar/banner, posições/zoom e banner da lista) e `roles` (ícone, insígnia, nome, cor, permissões e posição). A busca de `.update()` atual foi conferida nos componentes de configurações.
- Locks de moderação agora vêm depois da validação de permissão/estado do ator; as verificações sensíveis de hierarquia são repetidas sob o lock. A migration continua pendente de staging: nenhum SQL foi aplicado nesta revisão.

### Impacto e rollback das migrations pendentes

- **002 — autorização e convites:** altera grants/policies de escrita; cria tabelas de timeout, despacho e tentativas; adiciona coluna de posição em banimentos; atualiza RPCs e bloqueia duplicatas de `invites.code` normalizado. Não toca em `servers.invite_code`, inexistente no dump. Kick/ban removem associação e cargos do alvo, então não há rollback de dados confiável por simples `DROP`. Antes de aplicar, faça backup/PITR e registre o estado de associações/convites; em falha, restaure snapshot anterior e reconcilie membros a partir de auditoria/backup. Reverter apenas as policies reabre as permissões que esta migration fecha.
- **003 — funções, overload e leitura:** muda os corpos das funções de autorização, retira default de argumento, troca policies e ACLs de funções `SECURITY DEFINER`. Não reverta por `GRANT PUBLIC`: isso reabre execução perigosa. Rollback requer snapshot restaurável da etapa 002 imediatamente antes da 003; validar todas as chamadas RPC e ACLs após restauração.
- **004 — Storage, chat e Realtime:** altera configurações existentes de buckets, policies de `storage.objects`/`realtime.messages`, cria funções/triggers e constraints. Capture `storage.buckets`, policies, constraints e triggers antes da aplicação. Rollback requer restaurar esses valores e definições exatas do snapshot pré-004 e remover as funções/triggers/constraints novos; sem esse snapshot, interrompa a aplicação até obtê-lo.

**Limite comum:** nenhum dos rollbacks foi executado ou validado em staging. Não aplicar migrations 002–004 sem backup restaurável, teste de staging e aprovação explícita do dono.

**Build e `.env*`:** a primeira tentativa de `npm run build` ocorreu no workspace e o Next informou que carregou `.env.local` automaticamente; nenhum valor foi impresso. As execuções posteriores de build foram feitas em cópia temporária sem `.env*` e passaram. Não li o arquivo manualmente.

**Pasta `desktop`:** Electron não está em uso; não foi atualizada.

**Preservação:** `db/schema-atual-producao copy.sql` permanece sem commit. Não houve push, comando remoto ou aplicação de migration.

## Aprovações pendentes

- Aprovação explícita do dono para aplicar `20261012000100_auth_security_PENDENTE_APROVACAO.sql` em produção, após confirmar os UUIDs administrativos e o plano de recuperação.
- Revisão/aprovação do dono antes de aplicar migrations 002–004. Antes disso, gerar backup restaurável, eliminar duplicatas normalizadas de códigos se existirem e executar os scripts/checagens de integração em staging.
- Aprovação/decisão sobre política final de rate limit por e-mail no login e adoção de proxy de Auth que preserve IP e reduza vazamento temporal.
- Aprovação/decisão sobre remover ou restringir as policies de leitura aberta e como resolver as sobrecargas `is_server_member` sem quebrar chamadas existentes.
