# Segurança

## Autenticação e sessões

- Cadastro, login e recuperação usam Supabase Auth. O cliente nunca envia papel, função administrativa ou privilégio no cadastro.
- O cliente mantém a sessão no `localStorage` do Supabase. A CSP reduz a execução de scripts não autorizados, mas não elimina o impacto de um XSS sobre uma sessão legível por JavaScript.
- A configuração TOTP é opcional para usuários. A exigência de AAL2 para administradores depende da migration pendente e da inclusão dos UUIDs administrativos na allowlist.
- Erros de login são genéricos. Cadastro e recuperação apresentam mensagens genéricas, sem confirmar se o e-mail existe. Não é possível garantir tempo de resposta idêntico enquanto o navegador chama Supabase Auth diretamente; consulte `docs/PENDENCIAS.md`.

## Segredos

- Nunca exponha `service_role`, chaves privadas de integração, tokens Blob, segredos LiveKit/Pusher ou a chave secreta Turnstile em variáveis `NEXT_PUBLIC_*`.
- Valores públicos como chave publicável/anon do Supabase e identificadores de cliente que precisam chegar ao navegador não substituem autorização no servidor.
- Use `.env.example` somente como lista de nomes. Não copie segredos reais para Git, issues, logs ou mensagens.

## Banco e migrations

- As consultas do aplicativo usam o cliente Supabase com filtros tipados ou RPCs com argumentos. Não construa filtros PostgREST por concatenação de dados do usuário.
- As migrations `20261012000100` a `20261012000400` terminadas em `_PENDENTE_APROVACAO.sql` são propostas para revisão. Nenhuma foi aplicada por esta tarefa. Policies de escrita/moderação, as seis policies `USING (true)` do snapshot, as duas sobrecargas `is_server_member` e ACLs de funções `SECURITY DEFINER` só serão alteradas depois de aprovação e staging.
- A migration 003 varre funções `SECURITY DEFINER` no catálogo de `public` para fixar `search_path` e revogar EXECUTE de `PUBLIC`/`anon`; preserva grants `authenticated` para predicados RLS e RPCs identificados. A revisão estática não confirma o ACL resultante de um banco.
- A migration 002 cria controles de hierarquia de cargo e resgate de convite e pode remover membros/cargos quando uma ação é aprovada. Exige backup restaurável e revisão de duplicatas de convite antes da aplicação.
- A migration 004 restringe Storage e Realtime, limita mensagens e adiciona rate limit. A configuração e comportamento efetivo exigem teste no Supabase staging.
- Nunca rode `db/sekai_schema.sql` como substituto do snapshot de produção.

## Riscos da revisão adicional

- **Alta até a aprovação:** o banco em produção ainda conserva as policies/grants atuais. As migrations pendentes não são correções aplicadas.
- **Média:** Spotify usa OAuth PKCE com state, mas tokens de acesso e renovação ainda são persistidos no `localStorage`, ficando expostos a JavaScript de mesma origem em caso de XSS.
- **Média:** convite limita tentativas por usuário autenticado, sem rate limit por IP no RPC. Realtime, Pusher, voz, Storage e callbacks Blob ainda não foram testados com serviços reais.
- O relatório lista a cobertura local, avisos e etapas de staging necessárias. Os 23 testes automatizados são testes unitários/estáticos e não provam políticas efetivas no banco.

## Relato de falhas

Não publique tokens, dados pessoais ou detalhes exploráveis em um issue público. Registre internamente o caminho afetado, impacto e passos mínimos de reprodução; remova segredos de logs e artefatos antes de compartilhar.

## Verificações

Consulte [docs/RELATORIO-SEGURANCA.md](docs/RELATORIO-SEGURANCA.md) para escopo, testes e limitações atuais e [docs/PENDENCIAS.md](docs/PENDENCIAS.md) para a lista de configuração manual e aprovações necessárias.
