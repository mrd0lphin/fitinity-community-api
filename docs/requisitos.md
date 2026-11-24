# Requisitos e rastreabilidade

Fonte: PDF “Projeto Final — API Fitinity Community”, seis páginas, e aviso da atividade que limita a entrega ao backend. O link do Figma foi consultado, mas não pôde ser inspecionado neste ambiente. A aderência visual ao protótipo não foi verificada.

## Obrigatórios, sugestões e decisões

| Categoria | Conteúdo |
| --- | --- |
| Obrigatório | API Node.js/Express; JWT; bcrypt; PostgreSQL ou MySQL; Multer; Git/GitHub; Postman ou Insomnia. |
| Obrigatório | Cadastro/login, perfil, avatar, publicações, curtidas, comentários, autorização, validação, persistência e erros HTTP consistentes. |
| Obrigatório | README, .env.example sem segredos, documentação dos endpoints, evidências dos testes e apresentação técnica. |
| Sugestão do PDF | Nomes das rotas, campos iniciais e separação em controllers/services/repositories. |
| Preferência do PDF | Swagger/OpenAPI para documentar os endpoints. |
| Condicional | Deploy e URL publicada, somente quando exigidos pelo professor. |
| Decisão adotada | JavaScript ESM, PostgreSQL, SQL com pg, Postman, Swagger/OpenAPI e arquitetura simples em camadas. |
| Decisão adotada | Rotas /api/comments/:id para editar e excluir comentários, completando os requisitos funcionais. |
| Decisão adotada | JWT de 1h por padrão; rotas da comunidade autenticadas; leituras de imagens públicas. |
| Decisão adotada | JPEG/PNG/WebP, 5 MB, até 16 megapixels, sem animação; armazenamento local. |
| Decisão adotada | Curtida idempotente: 201 na criação, 200 se já existe; remoções com 204. |
| Decisão adotada | Paginação de publicações e comentários: page=1, limit=20, máximo 100. |

## Matriz de cobertura

A implementação foi verificada por 24 testes de integração em PostgreSQL real, 45 requisições/105 asserções pelo Postman CLI, validação do OpenAPI e requisições HTTP ao servidor iniciado. Os [logs de integração](evidencias/integracao.txt), [logs do Postman CLI](evidencias/postman-cli.txt) e [registro de validação](validacao.md) sustentam os estados abaixo. A publicação no GitHub foi conferida; a demonstração gráfica e o ensaio permanecem a cargo da equipe.

| ID | Requisito | Implementação/contrato | Evidência/estado |
| --- | --- | --- | --- |
| R01 | Cadastro com nome, e-mail e senha | POST /api/auth/register; users | Cadastro válido e 409 para e-mail repetido. |
| R02 | Hash seguro de senha | bcrypt; password_hash | Verificação do hash no teste e ausência do campo nas respostas. |
| R03 | Login e JWT | POST /api/auth/login; middleware | Credenciais válidas/inválidas e token expirado/inválido/ausente. |
| R04 | Consultar/atualizar perfil | GET/PATCH /api/users/me | Usuário A só altera seu perfil; e-mail duplicado bloqueado. |
| R05 | Avatar e imagem opcional | POST/DELETE avatar; POST/PATCH posts | Envio, acesso, substituição, remoção e limpeza de arquivos. |
| R06 | Validar tipo e tamanho | Multer; validação de imagem | Arquivo falso, MIME divergente, arquivo grande e imagem válida. |
| R07 | CRUD de publicações | /api/posts e /api/posts/:id | Criar, listar, consultar, editar e excluir. |
| R08 | Propriedade de conteúdo | Autoria vinda do JWT; serviços | Usuário B recebe 403 ao editar/excluir publicação de A. |
| R09 | Curtir e remover curtida | /api/posts/:id/likes; UNIQUE | Repetição sem duplicação e remoção idempotente. |
| R10 | Criar/listar comentários | /api/posts/:id/comments | Comentário associado a usuário e publicação existentes. |
| R11 | Editar/excluir próprios comentários | /api/comments/:id | Autor permitido e terceiro bloqueado. |
| R12 | Integridade relacional | FKs, UNIQUE e CHECK | Cascata post → likes/comments; e-mail e curtida únicos. |
| R13 | Validação e erros | Middleware central; envelopes | Dados inválidos, 400/401/403/404/409/413/415 e ausência de stack. |
| R14 | Segredos fora do Git | .env.example; .gitignore | .env, node_modules, .local e uploads ignorados; somente uploads/.gitkeep versionável. |
| R15 | Documentação executável | docs/openapi.json; /docs | OpenAPI válido; /docs/, script do Swagger e /openapi.json retornaram 200 por HTTP. |
| R16 | Testes manuais | postman/ | Coleção validada pelo CLI: 45 requisições/105 asserções passaram; interface gráfica ainda a demonstrar. |
| R17 | Execução reproduzível | README; migrations; scripts | Dependências instaladas; migrations/seed executados duas vezes sem duplicar dados; npm start e login/perfil verificados. |
| R18 | Apresentação técnica | guia-tecnico.md; demonstracao.md | Ensaio pela equipe, ainda a realizar. |
| R19 | Código no GitHub | Git local na branch main | Código publicado em https://github.com/mrd0lphin/fitinity-community-api; README e arquivos ocultos conferidos. |
| R20 | Deploy se solicitado | Fora do escopo atual | Confirmar somente se houver exigência do professor. |

## Relação com a avaliação

A autenticação/autorização e o CRUD representam 20% cada na rubrica. Requisitos/modelagem e upload valem 15% cada. Banco/organização, testes/erros e documentação/apresentação valem 10% cada.

Os marcos indicados no PDF são M1 Planejamento (20%), M2 Implementação (35%) e M3 Finalização (45%). O documento não define datas individuais para esses marcos; a data de 02/12/2026 às 23:59 foi fornecida no aviso da atividade.
