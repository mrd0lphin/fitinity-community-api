# API Fitinity Community

Backend da atividade final de Desenvolvimento de Sistemas, com cadastro, JWT, perfis, publicações, imagens, curtidas e comentários. Entrega informada: **02/12/2026 às 23:59 (Brasília)**.

O PDF do professor define o escopo. O protótipo do Figma não pôde ser inspecionado neste ambiente; a análise foi feita a partir das seis páginas do PDF. Não há frontend próprio. Deploy depende de solicitação do professor.

Verificação em 24/11/2026: **24 testes de integração** e **45 requisições com 105 asserções pelo Postman CLI** passaram. A sintaxe de 22 arquivos JavaScript, o OpenAPI e os JSONs foram validados. A API foi iniciada e suas rotas de saúde, documentação, login e perfil foram verificadas por HTTP. Veja os [logs e pendências](docs/validacao.md).

## Requisitos e decisões

**Obrigatórios:** Node.js, Express, JWT, bcrypt, Multer, PostgreSQL ou MySQL, Git/GitHub e Postman ou Insomnia.

**Escolhas desta implementação:** JavaScript ESM, PostgreSQL, consultas SQL com `pg`, Postman e OpenAPI 3.0.3. Imagens ficam em disco local; JPEG, PNG e WebP com até 5 MB, até 16 megapixels e sem animação. As rotas da tabela do PDF foram complementadas com edição e exclusão dos próprios comentários.

A [matriz de requisitos](docs/requisitos.md) distingue exigências e escolhas. O [guia técnico](docs/guia-tecnico.md) explica o fluxo do código.

## Preparar o ambiente

Requisitos: **Node.js 24 ou superior** e npm. O PostgreSQL pode ser executado pelo comando local abaixo, por Docker ou por uma instalação já existente.

```sh
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copie o valor aleatório gerado para `JWT_SECRET` no arquivo `.env`. Ele deve ter pelo menos 32 caracteres; o exemplo precisa ser substituído. Nunca envie esse arquivo ao GitHub.

### Opção A: PostgreSQL local sem Docker

Em um terminal:

```sh
npm run db:local
```

Mantenha esse terminal aberto e copie a `DATABASE_URL` indicada pelo comando para o `.env`. O processo executa um servidor PostgreSQL real usando a dependência de desenvolvimento `embedded-postgres`. Os dados locais ficam fora do versionamento. Encerre com Ctrl+C depois de parar a API.

Em outro terminal:

```sh
npm run db:migrate
npm run dev
```

### Opção B: PostgreSQL com Docker

Se já tiver Docker e Compose instalados:

```sh
docker compose up -d db
```

Utilize no `.env` a conexão de desenvolvimento abaixo. A senha é somente um exemplo local definido no Compose:

```dotenv
DATABASE_URL=postgresql://fitinity:fitinity_local_only@127.0.0.1:54329/fitinity
```

Depois execute `npm run db:migrate` e `npm run dev`. Para parar o banco sem apagar os dados: `docker compose stop db`.

### Opção C: PostgreSQL já instalado

Crie um banco de desenvolvimento exclusivo e configure sua URL em `DATABASE_URL`. Execute as migrations antes de iniciar a API.

### Endereços

- API: <http://127.0.0.1:3000>
- Verificação de disponibilidade: <http://127.0.0.1:3000/health>
- Swagger UI: <http://127.0.0.1:3000/docs>
- Contrato OpenAPI: <http://127.0.0.1:3000/openapi.json>

`npm start` inicia sem o modo de observação. `npm run db:seed` fornece os usuários demonstrativos `ana@example.com` e `bruno@example.com`, com senha sintética `Fitinity123!`, e suas publicações. Não sobrescreve contas existentes e é desabilitado em produção. Não é necessário para os testes.

## Configuração

| Variável | Finalidade |
| --- | --- |
| `NODE_ENV` | Ambiente, por exemplo `development`. |
| `HOST` / `PORT` | Endereço de escuta; padrões `127.0.0.1` e `3000`. |
| `DATABASE_URL` | Conexão PostgreSQL de desenvolvimento. |
| `JWT_SECRET` | Segredo aleatório com pelo menos 32 caracteres. |
| `JWT_EXPIRES_IN` | Validade do JWT; padrão `1h`. |
| `BCRYPT_ROUNDS` | Custo do bcrypt; padrão 10. |
| `UPLOAD_DIR` | Pasta de imagens; padrão `uploads`. |
| `MAX_UPLOAD_BYTES` | Máximo por arquivo; padrão 5242880 (5 MB). |
| `TEST_DATABASE_URL` | Opcional: banco externo exclusivo para testes. |

As migrations ficam em `database/migrations`. O esquema completo está em [modelo de dados](docs/modelo-dados.md).

## Usar a API

Cadastre um usuário:

```sh
curl -X POST http://127.0.0.1:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana Silva","email":"ana@example.com","password":"SenhaDidatica123!"}'
```

Faça login em `POST /api/auth/login` com e-mail e senha. A resposta contém `data.token`. No Swagger, clique em **Authorize** e informe esse token. Nas demais ferramentas, envie:

```http
Authorization: Bearer SEU_TOKEN
```

Registro e login são públicos. As outras rotas `/api` exigem autenticação. `/health`, `/docs`, `/openapi.json` e as imagens publicadas são públicos.

Respostas com corpo usam `{ "data": ... }`; erros usam `{ "error": { "code": "...", "message": "..." } }`. Exclusões retornam **204 sem corpo**. Listagens incluem `pagination` e aceitam `page` e `limit` (padrões 1 e 20, máximo 100).

O campo do avatar é `avatar`. Em publicações, use `content` e o arquivo opcional `image` por `multipart/form-data`. Para excluir somente a imagem de uma publicação, envie `{ "remove_image": true }` em seu PATCH. Não combine remoção com envio de uma nova imagem.

As URLs `avatar_url` e `image_url` são caminhos relativos; acrescente a origem da API para acessá-las.

## Testar

```sh
npm run check
npm test
npm run test:postman
```

`npm run check` verifica a sintaxe JavaScript, os artefatos JSON e o contrato OpenAPI. `npm test` executa integração contra um **PostgreSQL real temporário**, isolado do banco de desenvolvimento, e usa uma pasta temporária para os uploads.

`npm run test:postman` executa a coleção pelo Postman CLI, com PostgreSQL/API isolados e arquivos temporários de teste. Essa execução automatizada complementa a demonstração pela interface do Postman; não exige banco de desenvolvimento em execução. A coleção é executada por arquivo local, sem necessidade de conta ou envio dos resultados à nuvem.

Para atualizar o resumo sanitizado em docs/evidencias-postman.json, use `npm run test:postman -- --report`. Na execução registrada, as 45 requisições e 105 asserções passaram.

Se fornecer `TEST_DATABASE_URL`, utilize um banco exclusivo com nome terminado em `_test`, como `fitinity_test`, diferente do desenvolvimento: **os testes esvaziam as quatro tabelas da aplicação**. O runner aplica as migrations; não recria o esquema inteiro. Não aponte para dados que deseja preservar.

Para testes manuais, importe os dois arquivos da pasta [postman](postman/):
1. `Fitinity.postman_collection.json`.
2. `Fitinity.local.postman_environment.json`.

Selecione o ambiente local. Rode a pasta **01 - Fluxo principal** em ordem no Collection Runner. Ela cria dois usuários com e-mails novos, guarda os tokens no ambiente e verifica casos válidos e inválidos. Os usuários permanecem como dados demonstrativos; publicações e comentários do fluxo são removidos ao final.

A pasta **02 - Uploads** exige selecionar arquivos locais nos campos do tipo File. Execute depois do fluxo principal. Um envio acima do limite requer mais de **5.242.880 bytes**. Não exporte ambientes contendo tokens reais.

Consulte [validação e evidências](docs/validacao.md) para distinguir testes executados de verificações ainda pendentes.

## Estrutura

```text
src/
  config/        configuração de ambiente e conexão
  controllers/   entrada e saída HTTP
  middlewares/   autenticação, upload e erros
  repositories/  SQL parametrizado
  routes/        endpoints
  services/      regras de negócio
  utils/         validação, arquivos e erros da aplicação
  app.js         construção do Express
  server.js      conexão, inicialização e encerramento
database/        migrations
scripts/         banco local, migration, seed e verificações
tests/           integração com banco real
docs/            contrato e material da apresentação
postman/         coleção e ambiente sem segredos
```

## Entrega e apresentação

- [Requisitos e rastreabilidade](docs/requisitos.md).
- [Modelo e relacionamentos](docs/modelo-dados.md).
- [Guia técnico para explicar a solução](docs/guia-tecnico.md).
- [Roteiro da demonstração](docs/demonstracao.md).
- [Resultados e pendências de validação](docs/validacao.md).
- [Contrato dos endpoints](docs/openapi.json).

O Git local foi inicializado na branch `main`, com os arquivos preparados para o primeiro commit. `.env`, `node_modules`, `.local` e as imagens enviadas ficam ignorados; somente `uploads/.gitkeep` entra no repositório. A identidade do autor foi configurada com os dados informados e a versão final foi registrada em um commit local. A publicação remota ainda aguarda conexão com o GitHub.

## Concluir o envio ao GitHub

### Pacote para entrega

O arquivo `entrega/fitinity-community-api.zip` reúne código, lockfile, migrations, coleção do Postman, documentação e evidências. O pacote exclui `.env`, dependências, banco local, imagens enviadas e metadados `.git`. Após extrair, siga a preparação do ambiente neste README. Para versionar a cópia extraída, execute `git init -b main` antes dos comandos abaixo. O ZIP complementa a entrega; o professor também exige o endereço do repositório GitHub.

### Identidade e publicação

Na pasta do projeto, substitua os textos de exemplo pela identidade de quem assinará o commit. A configuração abaixo vale somente para este repositório:

```sh
git config user.name "SEU NOME"
git config user.email "SEU_EMAIL_DO_GITHUB"
git status --short
git add .
git commit -m "Implementa API Fitinity Community"
```

Crie um repositório vazio no GitHub da equipe, copie seu endereço e substitua `SEU_USUARIO/SEU_REPOSITORIO` abaixo. Depois execute:

```sh
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

Os comandos acima servem para uma cópia extraída ou para configurar outro autor. Nesta pasta de trabalho, a identidade e o commit local já foram preparados; os comandos de criação do remote e push ainda não foram executados. Após o envio, confira o acesso do professor e registre a URL em docs/validacao.md. A demonstração pela interface do Postman e o ensaio da equipe também permanecem pendentes.

## Referências oficiais

- [Express: instalação](https://expressjs.com/en/starter/installing/) e [tratamento de erros](https://expressjs.com/en/guide/error-handling/).
- [Multer: uploads e limites](https://expressjs.com/en/resources/middleware/multer/).
- [node-postgres: consultas parametrizadas](https://node-postgres.com/features/queries).
- [PostgreSQL: constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).
- [OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3.html).
- [Postman: testes de resposta](https://learning.postman.com/docs/tests-and-scripts/write-scripts/test-scripts/).
- [Postman CLI: execução local de coleções](https://learning.postman.com/docs/postman-cli/postman-cli-run-collection).
- [Git: identidade do autor](https://git-scm.com/book/en/v2/Getting-Started-First-Time-Git-Setup) e [repositórios remotos](https://git-scm.com/docs/git-remote).
