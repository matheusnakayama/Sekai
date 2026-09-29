# Integração do Sekai com o app de chamadas

Os servidores, canais de texto, membros e permissões continuam no Sekai. Ao abrir um canal de voz, o botão **Abrir chamada** abre o app de chamadas em outra guia. O ID do canal do Sekai é usado como ID da sala, então quem clicar no mesmo canal entra na mesma chamada.

## Configuração na Vercel

No projeto do Sekai, adicione a variável de ambiente:

- **Key:** `NEXT_PUBLIC_CALL_APP_URL`
- **Value:** endereço público do app de chamadas, sem `/` no final (por exemplo, `https://murasakidev.com.br`)
- **Environment:** Production (adicione também em Preview se quiser testar previews)

Depois, faça um novo deploy do Sekai. O app de chamadas deve estar publicado e acessível por HTTPS. Como o domínio personalizado pode ainda estar em validação, use temporariamente o endereço `*.vercel.app` do app de chamadas, se ele estiver funcionando; depois troque o valor para o domínio personalizado.

As variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` do Sekai continuam necessárias para login e servidores. Os valores de `LIVEKIT_*` não são usados por esta integração de voz. Não publique `.env.local` nem chaves privadas no GitHub.
