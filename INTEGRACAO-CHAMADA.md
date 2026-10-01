# Chamada de voz dentro do Sekai

O canal de voz do Sekai abre a tela completa de chamada dentro do próprio site. O ID do canal é usado como ID da sala, então todos os membros daquele canal entram na mesma chamada sem criar uma sala manualmente ou abrir outro domínio.

## Variáveis na Vercel

Configure no projeto do Sekai, em Production (e também Preview se usar deploys de prévia):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (pode receber a chave pública `sb_publishable_...`)
- `PUSHER_APP_ID`
- `PUSHER_SECRET` (secreta; nunca use prefixo `NEXT_PUBLIC_`)
- `NEXT_PUBLIC_PUSHER_KEY`
- `NEXT_PUBLIC_PUSHER_CLUSTER`

Para retransmitir chamadas em redes restritivas, também configure `METERED_APP_NAME` e `METERED_API_KEY`. Sem TURN, algumas redes podem não conseguir conectar entre si.

Para enviar imagens no chat da chamada, conecte um Vercel Blob Store ao projeto. A Vercel fornece `BLOB_STORE_ID` e `BLOB_WEBHOOK_PUBLIC_KEY`.

Depois de mudar variáveis, faça um novo deploy. Ative **Enable client events** no app Pusher Channels.

## Amizades e convites para voz

Execute `db/social_invites_migration.sql` e `db/direct_messages_migration.sql` uma vez no SQL Editor do mesmo projeto Supabase. A primeira migração cria as solicitações de amizade e convites de servidor; a segunda habilita mensagens diretas entre amigos aceitos com policies RLS e atualização em tempo real. A área **Amigos** fica no botão Início (ícone S) da barra de servidores. Pesquise pelo nome de usuário, aceite solicitações recebidas, abra uma conversa na lista lateral e use **Convidar** para compartilhar um servidor. Um link também é copiado para compartilhar fora do site. Os convites levam ao canal de voz quando o servidor tem um.

No chat de texto, clique com o botão direito em uma mensagem própria para editar ou excluir. Clique com o botão direito em um canal para excluí-lo (requer permissão de gerenciamento); no servidor, abra as configurações para ver suas opções de gerenciamento.

A chamada continua usando a infraestrutura de presença e sinalização Pusher já integrada. Cada canal de voz usa seu próprio ID como sala, então os membros que entram no mesmo canal ficam na mesma chamada. O botão **Convidar** da chamada copia um link que inclui o convite do servidor e o canal de voz; quem recebe não precisa digitar código. Os membros presentes na sala aparecem com nome e avatar, e podem receber solicitações de amizade pela lista de participantes ou pela lista de membros do servidor. Não é necessário adicionar variáveis de ambiente para esses recursos: mantenha as variáveis Supabase e Pusher listadas acima, com `PUSHER_SECRET` apenas no servidor.

## Temas

O seletor de cores inclui 26 opções (o tema Azul original e 25 alternativas), salva a escolha no navegador e aplica os temas adicionais sem exigir alterações na configuração da Vercel.
