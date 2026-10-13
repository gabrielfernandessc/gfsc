# 📣 CNA · Competição Nacional dos Anúncios

Quem avisa primeiro no grupo, pontua. Site mobile-first do placar oficial da turma.

## O que tem

- **Ranking** com pódio, tabela, líder 👑 e lanterna 🔦 (empates dividem a posição)
- **📣 Lançar anúncio**: escolhe quem avisou e o que aconteceu, com confete, vibração e frases zoeiras
- **Participantes**: toque em qualquer pessoa pra trocar **foto**, nome, apelido, emoji, cor ou ajustar pontos. Dá pra **adicionar** e **remover** gente
- **Missão especial Faustão** (+6), que só pode ser cumprida uma vez
- **Previsão fracassada** (-2) com direito a tela tremendo 🤡
- **Histórico** com "desfazer", **backup** (baixar/importar JSON) e botão **Enviar**, que manda a tabela formatada pro WhatsApp
- **🕵️ Registro de alterações**: toda mudança de ponto, anúncio, participante, foto ou apelido aparece com quem fez, quando e de qual aparelho. No modo compartilhado o registro é gerado pelo servidor, então ninguém apaga nem forja pelo site. Cada aparelho escolhe "quem é você?" na primeira visita

## Pontuação

| Evento | Pontos |
| --- | --- |
| Morte estratosférica | 5 |
| Morte de famoso | 3 |
| Prisão importante | 2 |
| Evento importante (ex: Barragem de Mariana) | 2 |
| Evento político importante | 1 |
| 🎯 Missão especial: Faustão | 6 |
| Previsão que falhou | -2 |

As regras e o placar inicial ficam em [`data.js`](data.js).

## Publicar na Vercel

1. Em [vercel.com/new](https://vercel.com/new), importe este repositório (framework: **Other**, sem build). Cada push publica de novo sozinho.
2. **Placar compartilhado (obrigatório pra todo mundo ver as mesmas fotos e pontos):** no projeto da Vercel, vá em **Storage → Create Database → Upstash for Redis** (ou qualquer Redis) e conecte ao projeto. Depois **Deployments → ⋯ → Redeploy**. A API aceita `KV_REST_API_URL`/`KV_REST_API_TOKEN`, `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (com ou sem prefixo) ou `REDIS_URL`.
   - Pra conferir: abra `/api/state?diag=1` no site. Deve aparecer `"conectou": true`.
   - Com o banco: todo mundo vê o mesmo placar, as mesmas fotos e o mesmo histórico (atualiza sozinho a cada 15 s). O selo no topo mostra **AO VIVO**.
   - Sem o banco: o site funciona em **modo LOCAL**, salvando só no navegador de cada um.

Pela linha de comando: `npx vercel --prod` (precisa estar logado ou ter `VERCEL_TOKEN`).

> Qualquer pessoa com o link consegue editar o placar. É um grupo de amigos, confiamos (mais ou menos).

## Rodar localmente

```bash
npx serve .
```

Sem a API, o site entra em modo local.

## Estrutura

```
index.html            páginas e telas (ranking, regras, histórico, sheets)
styles.css            visual
app.js                lógica, animações e sincronização
data.js               placar oficial e regras
registro.js           gera o registro de alterações (usado no site e na API)
api/state.js          função serverless da Vercel (placar compartilhado via Redis)
vercel.json           config da Vercel
```
