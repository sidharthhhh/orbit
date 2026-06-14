import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  joinChild: (childId: number) => void;
  leaveChild: (childId: number) => void;
}

const SocketContext = createContext<SocketContextType>({ socket: null, joinChild: () => {}, leaveChild: () => {} });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const socket = io(window.location.origin, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('Socket connected');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const joinChild = useCallback((childId: number) => {
    socketRef.current?.emit('join:child', childId);
  }, []);

  const leaveChild = useCallback((childId: number) => {
    socketRef.current?.emit('leave:child', childId);
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, joinChild, leaveChild }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
