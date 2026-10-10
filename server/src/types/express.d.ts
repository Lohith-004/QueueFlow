import type { ISessionInfo } from '@queueflow/shared';

declare global {
  namespace Express {
    interface Request {
      user?: ISessionInfo;
    }
  }
}

export {};
