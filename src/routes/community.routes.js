import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { createUpload } from '../middlewares/upload.middleware.js';

export function createRoutes(controller, repository, config) {
  const routes = Router();
  const upload = createUpload(config);

  routes.post('/auth/register', controller.register);
  routes.post('/auth/login', controller.login);
  routes.use(authenticate(repository, config));

  routes.get('/users/me', controller.me);
  routes.patch('/users/me', controller.updateProfile);
  routes.post('/users/me/avatar', upload.single('avatar'), controller.updateAvatar);
  routes.delete('/users/me/avatar', controller.deleteAvatar);

  routes.post('/posts', upload.single('image'), controller.createPost);
  routes.get('/posts', controller.listPosts);
  routes.get('/posts/:id', controller.getPost);
  routes.patch('/posts/:id', controller.authorizePost, upload.single('image'), controller.updatePost);
  routes.delete('/posts/:id', controller.deletePost);
  routes.post('/posts/:id/likes', controller.likePost);
  routes.delete('/posts/:id/likes', controller.unlikePost);
  routes.post('/posts/:id/comments', controller.createComment);
  routes.get('/posts/:id/comments', controller.listComments);
  routes.patch('/comments/:id', controller.updateComment);
  routes.delete('/comments/:id', controller.deleteComment);

  return routes;
}
