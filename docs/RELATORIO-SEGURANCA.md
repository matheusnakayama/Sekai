# Relatório de segurança

Data da revisão: 12/10/2026
Branch de trabalho: `seguranca-auth`

## Escopo revisado

- Fluxos de cadastro, login, recuperação e atualização de senha no App Router.
- Sessão Supabase existente, handlers de API, autorização Pusher/LiveKit, pesquisas PostgREST e SQL de referência em `db/schema-atual-producao.sql`.
- Configuração de headers de segurança, variáveis listadas em código e migrations existentes em `db/`.

O arquivo de produção `db/schema-atual-producao copy.sql` permaneceu fora de commits. `.env.local` e arquivos de segredo não foram lidos; somente o `.env.example` criado nesta alteração foi conferido. Não houve conexão com Supabase remoto, execução SQL, push ou publicação.

## Implementado no código

- Cadastro público na página inicial com Supabase Auth, validação Zod, senha entre 12 e 128 caracteres, sem regra de composição, nome de usuário limitado e sem campo de privilégio.
- Confirmação e recuperação usam mensagens genéricas na interface. Login sempre exibe erro genérico. O callback usa somente a origem canônica configurada e caminhos internos fixos.
- Cloudflare Turnstile é exigido na interface de cadastro, login e recuperação. O token é encaminhado ao Supabase Auth. A chave pública do site é entregue por endpoint sem cache; a chave secreta deve ser configurada no painel Supabase.
- Honeypot oculto: o cliente descarta o envio quando preenchido e o endpoint de segurança registra somente ação e horário, sem IP, e-mail ou conteúdo do campo.
- Redefinição de senha valida confirmação e mínimo de 12 caracteres. A conta pode configurar TOTP e concluir desafio AAL2.
- Cookies HttpOnly não foram adotados. O cliente ainda depende de acesso a token para Supabase Realtime, Pusher, LiveKit e WebRTC; testes reais desses caminhos exigem um ambiente configurado. Foi adicionada CSP com nonce por resposta e headers de defesa em profundidade.
- Handlers de API passaram a impor limites de corpo, validação Zod onde recebem dados, autenticar rotas de presença/TURN e restringir URL/identificadores. O token LiveKit agora expira em 10 minutos e consulta banimento/timeout antes de emitir.
- Filtros `.or()` montados com valores interpolados foram removidos das buscas de amizades e mensagens diretas, usando consultas `.eq()` parametrizadas.
- A dependência Zod foi declarada diretamente. Figtree não é mais baixada do Google Fonts no build; a lista de membros usa a pilha local já definida no CSS.

## Banco de dados e SQL

- O snapshot atual mostra funções `SECURITY DEFINER` sem `search_path` fixo, um `is_sekai_admin()` com identidades por e-mail embutidas e duas sobrecargas de `is_server_member`. Não removi a sobrecarga nem alterei políticas no banco em uso.
- A migration `supabase/migrations/20261012000100_auth_security_PENDENTE_APROVACAO.sql` propõe trigger idempotente de perfil, allowlist administrativa por UUID com exigência AAL2 configurável, busca-path fixo para funções definidoras e correção do SQL dinâmico do event trigger de RLS.
- A allowlist administrativa começa vazia. Aplicar a migration sem cadastrar os UUIDs atuais removeria acesso administrativo; por isso ela está explicitamente pendente e não foi executada.
- O SQL dinâmico encontrado no event trigger usa hoje `object_identity` na instrução `ALTER TABLE`. A proposta usa `%I` com nomes provenientes de `pg_class`/`pg_namespace`. Os demais `EXECUTE` verificados em migrations de `db/` usam instruções constantes ou valores fixos do próprio script; não encontrei entrada de requisição interpolada nessas instruções.
- Há políticas `USING (true)`/`WITH CHECK (true)` para leitura pública de definições/atribuições de insígnias e presença musical, além de uma política restritiva de atualização de mensagens que bloqueia marcadores de sistema. Não alterei essas policies sem confirmar a semântica do produto. Consulte `docs/PENDENCIAS.md`.
- Nenhuma operação de cadastro usa `service_role`; o signup chama Supabase Auth com a chave publicável/anon.

## Testes executados

- `npm test`: 4 testes de entrada Auth passaram (normalização e limites de e-mail, senha, campos de privilégio, CAPTCHA, TOTP, honeypot e redefinição).
- `npx tsc --noEmit --incremental false`: passou.
- `npm run lint`: passou com avisos preexistentes de hooks e `<img>`; a nova imagem do QR TOTP acrescenta um aviso `<img>`.
- `npm run build`: passou numa cópia temporária do workspace sem `.env*` e sem o SQL copiado. A primeira tentativa foi bloqueada por acesso à Google Fonts; removi a busca de fonte em build e repeti com sucesso, sem rede.
- Servidor local do build: `GET /` retornou 200; CSP presente, nonce gerado e aplicado ao HTML, `nosniff` e `X-Frame-Options: DENY`; `script-src` não contém `unsafe-inline`.
- Revisão adversarial estática e testes de schemas: campos extras de papel são descartados, senhas curtas/longas e tokens CAPTCHA excessivos são rejeitados, TOTP aceita apenas dígitos e corpos de API têm limites. Não houve teste contra serviços reais.

## Limitações e riscos remanescentes

- Supabase, Turnstile, SMTP, Vercel, voz, mensagens e Realtime não foram configurados neste ambiente; confirmação por e-mail, CAPTCHA real, rate limits e interação fim a fim não foram verificados.
- Cadastro/login/recuperação continuam chamando Supabase Auth no navegador para preservar o IP real nos limites do Supabase. As mensagens não enumeram contas, mas o tempo de resposta externo não é equalizado por este código. Limites por e-mail no login por senha também não são fornecidos pelo limite nativo do projeto; veja `docs/PENDENCIAS.md`.
- O honeypot é um sinal auxiliar do formulário, não uma barreira contra clientes que chamam Auth diretamente. CAPTCHA e limites do Auth precisam estar ativos no painel.
- `style-src 'unsafe-inline'` permanece para os muitos estilos dinâmicos React do aplicativo. Scripts inline são limitados por nonce; `script-src` de produção não permite `unsafe-inline` nem `unsafe-eval`.
- O preview de links consulta destinos públicos e valida DNS/redirects, mas DNS rebinding entre resolução e conexão não foi eliminado neste escopo.
- As políticas e funções pendentes exigem revisão e aprovação explícita do dono, além da inclusão manual dos UUIDs administrativos atuais antes de liberar a migration.
- `npm audit`/instalação completa não foram executados: acesso de rede está bloqueado, e a tentativa offline de resolver Zod não encontrou pacote no cache. A versão já presente no lockfile e em `node_modules` foi promovida a dependência direta; `npm ls zod --depth=0` confirmou a resolução local.
