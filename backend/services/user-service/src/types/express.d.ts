// Augments Express's Request so `req.user` is typed everywhere downstream of
// the `authenticate` middleware, instead of each controller casting it.
declare global {
  namespace Express {
    interface UserContext {
      id: string;
      email: string;
      role: string;
    }
    interface Request {
      user?: UserContext;
    }
  }
}

export {};
