import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { ApiError, forbidden, notFound } from '../utils/api-error.js';

export function createService(repository, images, config) {
  const requireOwnedPost = async (postId, userId, client, lock = false) => {
    const post = await repository.postRow(postId, client, lock);
    if (!post) throw notFound('Publicação não encontrada.');
    if (post.user_id !== userId) throw forbidden();
    return post;
  };
  const requirePost = async (postId, client, lock = false) => {
    const post = await repository.postRow(postId, client, lock);
    if (!post) throw notFound('Publicação não encontrada.');
    return post;
  };
  const requireOwnedComment = async (commentId, userId, client) => {
    const comment = await repository.commentById(commentId, client, true);
    if (!comment) throw notFound('Comentário não encontrado.');
    if (comment.user_id !== userId) throw forbidden();
    return comment;
  };
  const withImage = async (file, operation) => {
    const url = await images.save(file);
    try {
      return await operation(url);
    } catch (error) {
      await images.remove(url);
      throw error;
    }
  };

  return {
    async register({ name, email, password }) {
      const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
      return repository.createUser({ name, email, passwordHash });
    },

    async login({ email, password }) {
      const user = await repository.userByEmail(email);
      // O hash de comparação fictício também evita uma resposta imediata para e-mails inexistentes.
      const valid = await bcrypt.compare(password, user?.password_hash ?? '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
      if (!user || !valid) throw new ApiError(401, 'UNAUTHORIZED', 'E-mail ou senha inválidos.');
      const token = jwt.sign({}, config.jwtSecret, {
        algorithm: 'HS256', subject: String(user.id), expiresIn: config.jwtExpiresIn,
        issuer: 'fitinity-api', audience: 'fitinity-community',
      });
      const { password_hash, ...safeUser } = user;
      return { token, user: safeUser, expiresIn: config.jwtExpiresIn };
    },

    updateProfile(userId, values) {
      return repository.updateUser(userId, values);
    },

    async updateAvatar(userId, file) {
      const { user, oldUrl } = await withImage(file, (newUrl) =>
        repository.transaction(async (client) => {
          const current = await repository.userById(userId, client, true);
          if (!current) throw notFound('Usuário não encontrado.');
          const user = await repository.updateUser(userId, { avatar_url: newUrl }, client);
          return { user, oldUrl: current.avatar_url };
        }),
      );
      // Depois do COMMIT, uma falha ao apagar o arquivo antigo não deve apagar o novo.
      await images.remove(oldUrl);
      return user;
    },

    async deleteAvatar(userId) {
      const oldUrl = await repository.transaction(async (client) => {
        const user = await repository.userById(userId, client, true);
        if (!user) throw notFound('Usuário não encontrado.');
        await repository.updateUser(userId, { avatar_url: null }, client);
        return user.avatar_url;
      });
      await images.remove(oldUrl);
    },

    requireOwnedPost,

    async createPost(userId, content, file) {
      return withImage(file, (url) => repository.transaction(async (client) => {
        const postId = await repository.createPost(userId, content, url, client);
        return repository.postById(postId, userId, client);
      }));
    },

    async getPost(postId, userId) {
      const post = await repository.postById(postId, userId);
      if (!post) throw notFound('Publicação não encontrada.');
      return post;
    },

    listPosts(userId, options) {
      return repository.listPosts(userId, options);
    },

    async updatePost(postId, userId, values, file) {
      // A autorização é repetida sob lock para preservar a regra mesmo em requisições simultâneas.
      const { post, oldUrl } = await withImage(file, async (newUrl) => {
        const changes = { ...values };
        if (newUrl) changes.image_url = newUrl;
        return repository.transaction(async (client) => {
          const current = await requireOwnedPost(postId, userId, client, true);
          await repository.updatePost(postId, changes, client);
          return {
            post: await repository.postById(postId, userId, client),
            oldUrl: Object.hasOwn(changes, 'image_url') ? current.image_url : null,
          };
        });
      });
      await images.remove(oldUrl);
      return post;
    },

    async deletePost(postId, userId) {
      const oldUrl = await repository.transaction(async (client) => {
        const post = await requireOwnedPost(postId, userId, client, true);
        await repository.deletePost(postId, client);
        return post.image_url;
      });
      await images.remove(oldUrl);
    },

    likePost(userId, postId) {
      return repository.transaction(async (client) => {
        await requirePost(postId, client, true);
        return repository.likePost(userId, postId, client);
      });
    },

    unlikePost(userId, postId) {
      return repository.transaction(async (client) => {
        await requirePost(postId, client, true);
        await repository.unlikePost(userId, postId, client);
      });
    },

    createComment(userId, postId, content) {
      return repository.transaction(async (client) => {
        await requirePost(postId, client, true);
        return repository.createComment(userId, postId, content, client);
      });
    },

    async listComments(postId, options) {
      await requirePost(postId);
      return repository.listComments(postId, options);
    },

    updateComment(commentId, userId, content) {
      return repository.transaction(async (client) => {
        await requireOwnedComment(commentId, userId, client);
        return repository.updateComment(commentId, content, client);
      });
    },

    deleteComment(commentId, userId) {
      return repository.transaction(async (client) => {
        await requireOwnedComment(commentId, userId, client);
        await repository.deleteComment(commentId, client);
      });
    },
  };
}
