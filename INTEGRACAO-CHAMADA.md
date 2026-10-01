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
