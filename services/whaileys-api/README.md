# Motor Whaileys — Copiloto LocaKar

Serviço Node dedicado às sessões do WhatsApp do Copiloto: botões, listas e repasse das mensagens ao LocaKar.
**Roda em paralelo à Evolution API e não depende dela.** Tem container, porta e volume próprios.

## Variáveis (`.env`, nunca versionado)

```env
API_KEY=<aleatório, 32+ caracteres>              # igual a WHAILEYS_API_KEY na Vercel
WEBHOOK_URL=https://www.locakar.com.br/api/webhooks/whaileys
WEBHOOK_SECRET=<aleatório, 32+ caracteres>       # igual a WHAILEYS_WEBHOOK_SECRET na Vercel
HOST_PORT=8790                                   # porta local livre (só 127.0.0.1)
```

Para gerar os valores aleatórios: `openssl rand -hex 32`.

## Subir

```bash
docker compose up -d --build
curl -s http://127.0.0.1:8790/health   # {"ok":true}
```

Publique a porta por um site novo no nginx (ex.: `copilot.seudominio.com.br` → `127.0.0.1:8790`, com HTTPS). Configure `WHAILEYS_API_URL` na Vercel com essa URL.

## API (header `x-api-key`)

| Método | Rota | Uso |
|---|---|---|
| GET | `/sessions/locakar_copilot_<orgId>` | Estado, QR (data URL), código de pareamento, `me` |
| POST | `/sessions/<key>/connect` | Inicia a sessão. Com `{ "phone": "5511…" }`, gera código de pareamento |
| POST | `/sessions/<key>/send` | `{ to, text, buttons?: [{id,title}] , sections?: [{title, rows:[{id,title,description?}]}] }` |
| DELETE | `/sessions/<key>` | Logout e remove a sessão |

## Webhook

`POST WEBHOOK_URL` com os headers `x-whaileys-timestamp` e `x-whaileys-signature` (HMAC-SHA256 de `${timestamp}.${corpo}`).
Corpo: `{ instanceKey, me, key, message, pushName, media? }`. A mídia segue em base64 e só para áudio, imagem ou PDF de até 8 MB.

Comportamento:
- Ignora grupos, status e newsletters.
- Ignora ecos das próprias mensagens: os IDs enviados ficam em cache por 10 minutos. O LocaKar também deduplica pelo ID no banco.
- Os botões e listas usam o pacote `whaileys@6.5.1`. Se um aparelho não exibir os botões, o texto traz as opções numeradas e o LocaKar aceita a resposta pelo número.
