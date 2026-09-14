import { useEffect, useRef, useCallback, useState } from "react";

export interface BatchProgressEvent {
  stage: string;
  detail: string;
  ts: string;
}

export interface UseBatchProgressOptions {
  batchId: number;
  onStageChange?: (event: BatchProgressEvent) => void;
  onComplete?: (success: boolean) => void;
}

/**
 * Hook for listening to batch generation progress via Server-Sent Events.
 * Automatically opens/closes EventSource connection.
 */
export function useBatchProgress({
  batchId,
  onStageChange,
  onComplete,
}: UseBatchProgressOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/batches/${batchId}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.addEventListener("hello", (event) => {
      console.log("[BatchProgress] Connected:", event.data);
    });

    eventSource.addEventListener("stage", (event) => {
      try {
        const data = JSON.parse(event.data) as BatchProgressEvent;
        console.log("[BatchProgress] Stage:", data);
        onStageChange?.(data);
      } catch (err) {
        console.error("[BatchProgress] Parse error:", err);
      }
    });

    eventSource.addEventListener("end", (event) => {
      try {
        const data = JSON.parse(event.data) as BatchProgressEvent & { stage: string };
        console.log("[BatchProgress] Complete:", data);
        const success = data.stage === "done";
        onComplete?.(success);
        eventSource.close();
        eventSourceRef.current = null;
        setIsConnected(false);
      } catch (err) {
        console.error("[BatchProgress] Parse error:", err);
      }
    });

    eventSource.onerror = () => {
      console.error("[BatchProgress] Error");
      setIsConnected(false);
      setError("Connection error");
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [batchId, onStageChange, onComplete]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    isConnected,
    error,
  };
}
