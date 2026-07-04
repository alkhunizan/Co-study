// Ambient augmentation for properties our middleware attaches to Express
// requests (sessionMiddleware -> sessionId, attachUser -> user/userId).
declare global {
    namespace Express {
        interface Request {
            sessionId?: string;
            user?: any;
            userId?: string;
        }
    }
}

export {};
