import { useEffect } from 'react';

/** Subscribe to server-sent events for live inbox/campaign updates */
export function useEventStream(onTick: () => void) {
  useEffect(() => {
    const es = new EventSource('/api/events/stream', { withCredentials: true });
    es.onmessage = () => onTick();
    return () => es.close();
  }, [onTick]);
}
