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
- Revise RLS e funções `SECURITY DEFINER` antes de alterar produção. A migration terminada em `_PENDENTE_APROVACAO.sql` não está aprovada nem aplicada.
- Nunca rode `db/sekai_schema.sql` como substituto do snapshot de produção.

## Relato de falhas

Não publique tokens, dados pessoais ou detalhes exploráveis em um issue público. Registre internamente o caminho afetado, impacto e passos mínimos de reprodução; remova segredos de logs e artefatos antes de compartilhar.

## Verificações

Consulte [docs/RELATORIO-SEGURANCA.md](docs/RELATORIO-SEGURANCA.md) para escopo, testes e limitações atuais e [docs/PENDENCIAS.md](docs/PENDENCIAS.md) para a lista de configuração manual e aprovações necessárias.
