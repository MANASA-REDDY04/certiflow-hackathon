'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, AlertTriangle, ShieldAlert, CheckCircle, Info, X } from 'lucide-react';

export interface SSEEvent {
  id?: string;
  type: string;
  title: string;
  message: string;
  batchId?: string;
  timestamp: string;
}

interface NotificationBellProps {
  apiBaseUrl: string;
  jwtToken: string | null;
  onNotificationReceived?: (event: SSEEvent) => void;
}

export default function NotificationBell({
  apiBaseUrl,
  jwtToken,
  onNotificationReceived,
}: NotificationBellProps) {
  const [notifications, setNotifications] = useState<SSEEvent[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!jwtToken) {
      setIsConnected(false);
      return;
    }

    const sseUrl = `${apiBaseUrl}/api/events/stream?token=${encodeURIComponent(jwtToken)}`;
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data: SSEEvent = JSON.parse(event.data);
          if (data.type === 'connected') return;

          setNotifications((prev) => [data, ...prev.slice(0, 49)]);
          setUnreadCount((prev) => prev + 1);

          if (onNotificationReceived) {
            onNotificationReceived(data);
          }
        } catch (e) {
          console.warn('Failed to parse SSE event data', e);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
      };
    } catch (e) {
      setIsConnected(false);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [apiBaseUrl, jwtToken]);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setUnreadCount(0);
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'sla_reminder':
        return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
      case 'state_escalation':
        return <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />;
      case 'batch_approved':
        return <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-indigo-500 flex-shrink-0" />;
    }
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="relative p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition focus:outline-none"
        title="Live Notifications (SSE)"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        <span
          className={`absolute bottom-1 right-1 block h-2 w-2 rounded-full ring-2 ring-white ${
            isConnected ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
          title={isConnected ? 'SSE Live Stream Active' : 'SSE Offline'}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white shadow-xl ring-1 ring-black/5 z-50 border border-slate-200">
          <div className="p-3.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-slate-900">Notifications</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {isConnected ? 'Live Stream' : 'Disconnected'}
              </span>
            </div>
            {notifications.length > 0 && (
              <button
                onClick={() => setNotifications([])}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                Clear
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No notifications yet. Workflow updates and SLA alerts will appear here in real-time.
              </div>
            ) : (
              notifications.map((item, index) => (
                <div key={item.id || index} className="p-3.5 hover:bg-slate-50 transition space-y-1">
                  <div className="flex items-start space-x-2.5">
                    {getEventIcon(item.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 leading-tight">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5 break-words">{item.message}</p>
                      <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
