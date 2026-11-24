# Roteiro da demonstração

Prepare uma execução de aproximadamente 8 a 12 minutos e ensaie antes da entrega. Todos os integrantes precisam conseguir explicar o código.

## Preparação

1. Iniciar o PostgreSQL e a API conforme o README.
2. Abrir /health e /docs.
3. Importar coleção e ambiente do Postman, selecionar o ambiente local.
4. Separar duas imagens pequenas JPEG/PNG/WebP, um arquivo texto, um texto renomeado para .png e um arquivo acima de 5 MB.
5. Conferir os resultados atuais em validacao.md. Não apresentar como executado um caso apenas planejado.

A pasta “01 - Fluxo principal” usa e-mails novos a cada execução. Ela deve ser executada em ordem; as variáveis guardam tokens e identificadores dos dois usuários.

## Sequência

| Momento | Ação | O que explicar |
| --- | --- | --- |
| 1 | Mostrar estrutura, modelo e Swagger | Responsabilidade das camadas e relacionamentos. |
| 2 | Cadastrar A e repetir seu e-mail | 201 no primeiro cadastro e 409 na duplicidade; senha vira hash. |
| 3 | Cadastrar B; fazer login válido e inválido | JWT, validade e resposta 401 para credenciais inválidas. |
| 4 | Consultar perfil sem token e com token A | Proteção das rotas; depois mostrar alteração do próprio nome. |
| 5 | Criar e listar publicação de A | Autoria pelo token; texto e imagem opcional; paginação. |
| 6 | B tentar editar/excluir a publicação de A | 403; autenticação é diferente de autorização. |
| 7 | A editar sua publicação | Alteração autorizada. |
| 8 | B curtir duas vezes e remover a curtida | Idempotência e restrição única no banco. |
| 9 | B comentar, A tentar alterar e B editar | Comentário com autor; bloqueio do conteúdo alheio. |
| 10 | Excluir comentário e publicação | 204 sem corpo; posterior consulta retorna 404. |
| 11 | Executar pasta manual de uploads | Avatar válido, acesso, substituição/exclusão, publicação com imagem e rejeições. |
| 12 | Mostrar testes e decisões técnicas | Resultados reais, dados de teste isolados e documentação. |

## Verificações do upload

- Selecionar o campo File correto: avatar para perfil, image para publicação.
- Enviar uma imagem válida e abrir a URL retornada.
- Substituir a imagem e verificar que o arquivo anterior deixou de existir.
- Excluir avatar ou remover a imagem da publicação.
- Enviar .txt e texto renomeado para .png: rejeitar com 415.
- Enviar mais de 5.242.880 bytes: rejeitar com 413.
- Não definir Content-Type multipart manualmente; o Postman inclui o boundary.

Se a imagem escolhida exceder 16 megapixels ou for animada, ela também será rejeitada conforme a política documentada.

## Complemento para a cascata

Crie uma publicação, uma curtida e um comentário; exclua a publicação pelo autor. Mostre que consultar seus comentários retorna 404 e que os testes de integração conferem a remoção das relações no banco. A coleção principal exclui o comentário antes da publicação para demonstrar ambos os endpoints separadamente.

## Checklist de entrega

- [ ] Executar os comandos do README a partir de um ambiente limpo.
- [ ] Executar check e testes e registrar resultados reais.
- [ ] Reproduzir a coleção no Postman e conferir os arquivos do upload.
- [ ] Revisar OpenAPI, modelo e matriz de requisitos.
- [ ] Confirmar que .env, tokens e uploads não estão versionados.
- [ ] Publicar o código no repositório GitHub da equipe e conferir o acesso.
- [ ] Preencher integrantes, turma e demais dados pedidos pelo professor.
- [ ] Ensaiar a apresentação com participação de todos.
- [ ] Confirmar exigência de deploy somente se o professor a tiver definido.

A apresentação foi preparada como material escrito; o ensaio e a apresentação oral precisam ser realizados pelos integrantes.
