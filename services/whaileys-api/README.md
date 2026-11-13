# Whaileys API — WhatsApp com botões e listas

API própria para conectar números de WhatsApp e enviar **botões e listas**. Atende vários sistemas, cada um com a **própria instância**, com token, webhook e segredo próprios.
Roda em paralelo à Evolution API, sem depender dela.

- **Produção:** `https://copilot.tubaraoemprestimo.com.br`, container `locakar-whaileys` na VM Oracle (`/opt/locakar-whaileys`), acesso por `ssh tubarao-vm`.
- **Chave de administrador:** `API_KEY` no `/opt/locakar-whaileys/.env`. Só cria, lista e remove instâncias. Nunca vai para outros sistemas.

## Modelo de segurança

| Credencial | Onde fica | O que permite |
|---|---|---|
| `API_KEY` (admin) | Só no `.env` da VM | Criar, listar e remover instâncias; operar qualquer sessão |
| `token` da instância | `.env` do sistema cliente | Conectar, ver status e enviar **somente** na própria instância |
| `webhookSecret` | `.env` do sistema cliente | Validar a assinatura dos webhooks recebidos |

O `token` e o `webhookSecret` aparecem **uma única vez**, na criação. A API guarda apenas o hash do token.

## 1. Criar instância (admin)

```bash
curl -X POST https://copilot.tubaraoemprestimo.com.br/instances \
  -H "x-api-key: $ADMIN_KEY" -H "content-type: application/json" \
  -d '{"name":"pistec","webhookUrl":"https://www.pistec.com.br/api/webhooks/whaileys"}'
# 201 → {"instance":"pistec","token":"…64 hex…","webhookSecret":"…64 hex…","webhookUrl":"…"}
```

Regras do nome: 3 a 63 caracteres, só minúsculas, números, `_` e `-`. O `webhookUrl` precisa ser HTTPS.

Outras operações de administração:
- `GET /instances`: lista as instâncias e o estado de cada uma.
- `PATCH /instances/<nome>`: aceita `{"webhookUrl":"…"}`, `{"rotateToken":true}` e `{"rotateSecret":true}`.
- `DELETE /instances/<nome>`: desconecta o número e apaga a instância.

## 2. Operar a instância (sistema cliente, header `x-api-key: <token>`)

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| GET | `/sessions/<nome>` | — | `{state, qr, pairingCode, me}` |
| POST | `/sessions/<nome>/connect` | `{}`, ou `{"phone":"5511999999999"}` para código de pareamento | Status atual (o QR chega como data URL) |
| POST | `/sessions/<nome>/send` | Ver abaixo | `{messageId}` |
| DELETE | `/sessions/<nome>` | — | Desconecta o número (logout) |

`state` assume: `disconnected`, `connecting` (aguardando QR), `open` (conectado) ou `closed` (reconectando).

### Enviar

```jsonc
// Texto
{ "to": "5511999999999", "text": "Olá!" }
// Botões (até 3)
{ "to": "5511999999999", "text": "Confirma?\n\n1. Sim\n2. Não", "buttons": [{ "id": "yes:42", "title": "✅ Sim" }, { "id": "no:42", "title": "❌ Não" }] }
// Lista (até 10 seções × 10 linhas)
{ "to": "5511999999999", "text": "Escolha:", "buttonText": "Ver opções",
  "sections": [{ "title": "Planos", "rows": [{ "id": "plan:1", "title": "Básico", "description": "R$ 49" }] }] }
```

`to` aceita o número puro (`55` + DDD + número) ou um JID (`…@s.whatsapp.net` / `…@lid`).

**Sempre** coloque as opções numeradas também no texto. Se o aparelho não exibir os botões, o usuário responde "1" ou "2".

## 3. Receber (webhook)

`POST` no `webhookUrl` da instância, com dois headers:
- `x-whaileys-timestamp`: milissegundos.
- `x-whaileys-signature`: HMAC-SHA256 hexadecimal de `${timestamp}.${corpoCru}` com o `webhookSecret`.

```jsonc
{
  "instanceKey": "pistec",
  "me": { "id": "5511…:12@s.whatsapp.net", "lid": "…@lid" },   // número conectado
  "key": { "id": "3EB0…", "remoteJid": "5511…@s.whatsapp.net", "fromMe": false },
  "message": { /* proto do WhatsApp, já sem os invólucros ephemeral/viewOnce */ },
  "pushName": "Fulano",
  "media": { "mimetype": "audio/ogg", "data": "<base64>" }      // só áudio, imagem ou PDF até 8 MB
}
```

Onde está o clique ou o texto dentro de `message`:

| Tipo | Caminho |
|---|---|
| Botão | `buttonsResponseMessage.selectedButtonId` ou `templateButtonReplyMessage.selectedId` |
| Lista | `listResponseMessage.singleSelectReply.selectedRowId` |
| Native flow | `JSON.parse(interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id` |
| Texto | `conversation` ou `extendedTextMessage.text` |
| Mídia | `audioMessage`, `imageMessage`, `documentMessage` (o conteúdo vem em `media`) |

Regras obrigatórias para o sistema que recebe o webhook:
1. **Validar a assinatura.** Use comparação em tempo constante, rejeite timestamp com mais de 5 minutos de diferença e responda `401` se não bater.
2. **Deduplicar por `key.id`.** A entrega é *pelo menos uma vez*: o motor tenta 3 vezes se receber erro 5xx.
3. **Responder `200` rápido** e processar depois.
4. **`fromMe: true`** é mensagem enviada pelo próprio número conectado. Trate isso de propósito: no self-chat ela vale como comando; numa conversa com cliente, ignore.
5. Grupos, status e newsletters nunca chegam ao webhook.

## Implantação

```bash
docker compose -p locakar-whaileys up -d --build
curl -s http://127.0.0.1:8790/health
```

- O `.env` contém `API_KEY`, além de `WEBHOOK_URL` e `WEBHOOK_SECRET`, usados só pelas instâncias legadas `locakar_copilot_*`, e `HOST_PORT=8790`.
- O cadastro das instâncias fica em `/data/sessions/.instances.json`, no volume `whaileys-sessions`.
- A porta só escuta em `127.0.0.1`. A exposição pública passa pelo túnel Cloudflare `tubarao-ssh` (hostname `copilot.tubaraoemprestimo.com.br` → `localhost:8790`).
- Cada número conectado ocupa memória. O limite atual é `mem_limit: 512m`; aumente com muitas instâncias.

## Limites

Envia texto, botões e listas. Recebe texto, cliques, áudio, imagem e PDF. **Não** envia mídia e não trata grupos, contatos nem histórico; para isso, use a Evolution.
Botões fora da API oficial podem deixar de aparecer se o WhatsApp mudar o protocolo; mantenha sempre o texto numerado como reserva.
