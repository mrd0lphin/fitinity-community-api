import { bodyFields, boolean, email, id, invalid, pagination, password, text } from '../utils/validation.js';

const paginated = ({ rows, total }, { page, limit }) => ({
  data: rows,
  pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
});

export function createController(service) {
  return {
    async register(req, res) {
      const body = bodyFields(req.body, ['name', 'email', 'password']);
      const user = await service.register({
        name: text(body.name, 'name', { min: 2, max: 100 }),
        email: email(body.email), password: password(body.password),
      });
      res.status(201).json({ data: user });
    },

    async login(req, res) {
      const body = bodyFields(req.body, ['email', 'password']);
      // Não se aplica o tamanho mínimo de cadastro ao login: credenciais incorretas resultam em 401.
      if (typeof body.password !== 'string' || !body.password || Buffer.byteLength(body.password, 'utf8') > 72) {
        invalid('Informe a senha com no máximo 72 bytes UTF-8.', 'password');
      }
      res.json({ data: await service.login({ email: email(body.email), password: body.password }) });
    },

    me(req, res) {
      res.json({ data: req.user });
    },

    async updateProfile(req, res) {
      const body = bodyFields(req.body, ['name', 'email']);
      const values = {};
      if (Object.hasOwn(body, 'name')) values.name = text(body.name, 'name', { min: 2, max: 100 });
      if (Object.hasOwn(body, 'email')) values.email = email(body.email);
      if (!Object.keys(values).length) invalid('Informe name ou email para atualizar o perfil.');
      res.json({ data: await service.updateProfile(req.user.id, values) });
    },

    async updateAvatar(req, res) {
      bodyFields(req.body, []);
      if (!req.file) invalid('Envie uma imagem no campo avatar.', 'avatar');
      res.json({ data: await service.updateAvatar(req.user.id, req.file) });
    },

    async deleteAvatar(req, res) {
      await service.deleteAvatar(req.user.id);
      res.status(204).end();
    },

    async authorizePost(req, res, next) {
      req.postId = id(req.params.id);
      await service.requireOwnedPost(req.postId, req.user.id);
      next();
    },

    async createPost(req, res) {
      const body = bodyFields(req.body, ['content']);
      const content = text(body.content, 'content', { max: 5000 });
      res.status(201).json({ data: await service.createPost(req.user.id, content, req.file) });
    },

    async getPost(req, res) {
      res.json({ data: await service.getPost(id(req.params.id), req.user.id) });
    },

    async listPosts(req, res) {
      const options = pagination(req.query);
      res.json(paginated(await service.listPosts(req.user.id, options), options));
    },

    async updatePost(req, res) {
      const body = bodyFields(req.body, ['content', 'remove_image']);
      const changes = {};
      if (Object.hasOwn(body, 'content')) changes.content = text(body.content, 'content', { max: 5000 });
      const removeImage = Object.hasOwn(body, 'remove_image') ? boolean(body.remove_image, 'remove_image') : false;
      if (removeImage && req.file) invalid('Envie image ou remove_image=true, sem combinar as duas opções.');
      if (removeImage) changes.image_url = null;
      if (!Object.keys(changes).length && !req.file) invalid('Informe content, image ou remove_image=true para atualizar.');
      res.json({ data: await service.updatePost(req.postId, req.user.id, changes, req.file) });
    },

    async deletePost(req, res) {
      await service.deletePost(id(req.params.id), req.user.id);
      res.status(204).end();
    },

    async likePost(req, res) {
      bodyFields(req.body, []);
      const { like, created } = await service.likePost(req.user.id, id(req.params.id));
      res.status(created ? 201 : 200).json({ data: like });
    },

    async unlikePost(req, res) {
      await service.unlikePost(req.user.id, id(req.params.id));
      res.status(204).end();
    },

    async createComment(req, res) {
      const body = bodyFields(req.body, ['content']);
      const content = text(body.content, 'content', { max: 2000 });
      res.status(201).json({ data: await service.createComment(req.user.id, id(req.params.id), content) });
    },

    async listComments(req, res) {
      const options = pagination(req.query);
      res.json(paginated(await service.listComments(id(req.params.id), options), options));
    },

    async updateComment(req, res) {
      const body = bodyFields(req.body, ['content']);
      const content = text(body.content, 'content', { max: 2000 });
      res.json({ data: await service.updateComment(id(req.params.id), req.user.id, content) });
    },

    async deleteComment(req, res) {
      await service.deleteComment(id(req.params.id), req.user.id);
      res.status(204).end();
    },
  };
}
