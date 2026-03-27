import { createContext } from 'react';
import { useWebRTCBridge } from '@/hooks/useWebRTCBridge';

export type WebRTCContextType = ReturnType<typeof useWebRTCBridge>;

export const WebRTCContext = createContext<WebRTCContextType | null>(null);
