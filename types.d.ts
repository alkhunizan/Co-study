// Ambient augmentation for properties our middleware attaches to Express
// requests (sessionMiddleware -> sessionId, attachUser -> user/userId).
declare global {
    interface Window {
        HALASTUDY_CONFIG?: any;
        HalaAuth?: any;
        HalaCore?: any;
        HalaInsights?: any;
        HalaRoomFocus?: any;
        HalaSchedule?: any;
        HalaUI?: any;
        HalastudyVideoClient?: any;
        io?: any;
    }

    const io: any;
    const FaceDetector: any;

    interface Element {
        __messageData?: any;
        dataset: DOMStringMap;
        disabled: boolean;
        placeholder: string;
        title: string;
    }

    interface EventTarget {
        closest(selectors: string): Element | null;
    }

    interface HTMLElement {
        checked: boolean;
        disabled: boolean;
        href: string;
        meeting?: any;
        src: string;
        srcObject: MediaStream | null;
        value: string;
        videoWidth: number;
    }

    interface RTCPeerConnection {
        __meta?: any;
    }

    namespace Express {
        interface Request {
            sessionId?: string;
            user?: any;
            userId?: string;
        }
    }
}

export {};
