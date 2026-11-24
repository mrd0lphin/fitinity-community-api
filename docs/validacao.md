# Validação e evidências

Este arquivo distingue execução automatizada, verificação HTTP e demonstração manual. Os resultados registrados foram obtidos em **24/11/2026**. A operação pela interface do Postman e o ensaio dos integrantes continuam pendentes.

## Registro da execução

| Verificação | Situação | Evidência |
| --- | --- | --- |
| Dependências e auditoria | Instalação concluída; 163 pacotes auditados, 0 vulnerabilidades informadas | Auditoria após adoção do Postman CLI 1.93.1; resultado representa a data da execução. |
| Sintaxe e contrato OpenAPI | Executada com sucesso | npm run check; 22 arquivos JavaScript, OpenAPI e JSONs do Postman válidos. |
| Integração com PostgreSQL real | 24 testes passaram, 0 falhas e 0 ignorados | npm test; PostgreSQL 19.0 temporário; duração de aproximadamente 1,64 s; saída 0; [log completo](evidencias/integracao.txt). |
| Coleção via Postman CLI | 45 requisições e 105 asserções passaram, 0 falhas | npm run test:postman -- --report; banco/API isolados; saída 0; [log completo](evidencias/postman-cli.txt) e [resumo sanitizado](evidencias-postman.json). |
| Instalação limpa | Executada com sucesso em cópia sem .env, node_modules ou banco prévio | npm ci, npm run check, npm test e npm run test:postman -- --report; todos concluídos com código 0. |
| Banco local | Inicialização confirmada em 127.0.0.1:54329 | npm run db:local; PostgreSQL real. |
| Migrations e seed | Executados duas vezes sem duplicar os dados demonstrativos | npm run db:migrate e npm run db:seed; contas sintéticas de Ana e Bruno. |
| Inicialização da API | Confirmada em 127.0.0.1:3000 | npm start; .env local com segredo aleatório, fora do Git. |
| Saúde e documentação HTTP | Respostas 200 confirmadas | /health, /docs/, /docs/swagger-ui-init.js e /openapi.json. |
| Login e perfil privado no servidor iniciado | Confirmados por requisições HTTP | Login da conta demonstrativa e GET /api/users/me com Bearer; token não incluído nos logs de entrega. |
| Higiene do Git | Verificada | .env, node_modules e .local ignorados; uploads versiona somente .gitkeep. |
| Git local e GitHub | Código publicado em repositório público; arquivos ocultos complementados após conferência | [mrd0lphin/fitinity-community-api](https://github.com/mrd0lphin/fitinity-community-api); publicação pela interface web, sem envio autenticado pelo terminal. |
| Collection Runner do Postman | Pendente de execução manual | Salvar relatório ou captura após operação pela interface. |
| Upload manual pelo Postman/Swagger | Pendente de execução manual | Selecionar arquivos e registrar resposta e acesso. |
| Inspeção do Figma | Não realizada | URL fornecida ficou inacessível neste ambiente; não houve verificação visual do protótipo. |
| Deploy | Condicional | Apenas se exigido pelo professor. |
| Ensaio/apresentação técnica | Pendente dos integrantes | Executar o roteiro em demonstracao.md. |

As portas locais acima foram usadas na verificação. Se os processos tiverem sido encerrados, siga os comandos do README para iniciá-los novamente.

## Casos de integração executados

Os grupos abaixo foram cobertos pelos 24 testes do [log de integração](evidencias/integracao.txt).

| Grupo | Casos verificados | Resultado |
| --- | --- | --- |
| Cadastro | Dados válidos, e-mail repetido e normalizado, senha inválida, hash bcrypt | Passou. |
| Login | Credenciais válidas e inválidas; emissão do JWT | Passou. |
| JWT | Token ausente, inválido, expirado, claims/algoritmo incorretos e válido | Passou. |
| Perfil | Consultar/editar somente o próprio perfil e impedir e-mail em uso | Passou. |
| Publicações | Criar/listar/consultar/editar/excluir, conteúdo, paginação, IDs e autoria | Passou. |
| Propriedade | Dois usuários; bloqueio de alterações/exclusões em conteúdo alheio | Passou. |
| Curtidas | Criar, repetir, remover e restrição única no banco | Passou. |
| Comentários | Criar/listar/editar/excluir, validação e publicação inexistente | Passou. |
| Imagens | JPEG/PNG/WebP reais, tamanho, MIME/extensão/conteúdo, acesso, troca e remoção | Passou. |
| Limpeza | Falha no banco, exclusão e ausência de arquivo órfão nos fluxos tratados | Passou. |
| Integridade | Cascata de publicação para curtidas/comentários | Passou. |
| HTTP | JSON e dados inválidos, 404, envelopes, ausência de hash/stack e proteção de diretórios | Passou. |

O caso de rollback usa uma falha real controlada no PostgreSQL por trigger. O log “Falha controlada de persistência no teste” é esperado: o teste verifica resposta 500 sem detalhes internos e limpeza do arquivo novo.

O Postman CLI executou 34 requisições do fluxo principal e 11 de upload. O runner forneceu imagens reais e arquivos inválidos temporários, sem editar a coleção importável. As 105 asserções passaram. O resumo sanitizado não contém tokens, cabeçalhos ou corpos de resposta.

## Reproduzir e atualizar

Execute:

```sh
npm run check
npm test
npm run test:postman -- --report
```

O último comando atualiza o resumo sanitizado em evidencias-postman.json. Registre os comandos, a data, os totais e as limitações. Preserve os logs sem tokens ou credenciais reais.

Se fornecer TEST_DATABASE_URL, utilize um banco exclusivo cujo nome termine em _test, diferente do desenvolvimento. As quatro tabelas da aplicação serão esvaziadas pelos testes; o esquema inteiro não é recriado.

Para demonstração pela interface, use o Collection Runner na pasta principal da coleção. A pasta de uploads exige selecionar arquivos locais. Capture autenticação, autorização, upload válido/inválido e CRUD. Remova tokens e dados sensíveis das capturas ou exportações.

A integração automatizada e a execução pela linha de comando são evidências reais. Elas não substituem o ensaio oral da equipe nem significam que a interface gráfica foi operada.
