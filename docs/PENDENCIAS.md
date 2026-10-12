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
- Revise as duas sobrecargas de `is_server_member` e as policies de leitura pública indicadas no relatório. Elas não foram removidas nem executadas; mudanças adicionais devem receber outra migration pendente com seus efeitos e plano de rollback.
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
7. **Policies e SQL:** leituras abertas para insígnias/presença musical e sobrecargas de `is_server_member` exigem decisão de produto. O event trigger original usa `object_identity` no SQL dinâmico; correção está na migration pendente. Nenhuma migration foi aplicada.
8. **Dependências e rede:** o build inicial tentou buscar Figtree no Google Fonts e foi bloqueado; removi essa dependência e o build isolado passou. `npm audit` e download/instalação online foram omitidos por falta de rede. A tentativa `npm install --offline` não achou o pacote Zod no cache, embora Zod 4.1.11 já estivesse no lockfile e em `node_modules`; a dependência foi declarada diretamente e verificada localmente.
9. **Serviços reais:** painel Supabase, SMTP, Turnstile, Vercel, DNS, Pusher, LiveKit, Metered e Realtime não foram acessados. Testes reais de signup verificado, recuperação, MFA, mensagens, voz e canais realtime continuam pendentes.

## Aprovações pendentes

- Aprovação explícita do dono para aplicar `20261012000100_auth_security_PENDENTE_APROVACAO.sql` em produção, após confirmar os UUIDs administrativos e o plano de recuperação.
- Aprovação/decisão sobre política final de rate limit por e-mail no login e adoção de proxy de Auth que preserve IP e reduza vazamento temporal.
- Aprovação/decisão sobre remover ou restringir as policies de leitura aberta e como resolver as sobrecargas `is_server_member` sem quebrar chamadas existentes.
