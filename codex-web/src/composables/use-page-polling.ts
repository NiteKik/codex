import { onMounted, onUnmounted } from "vue";

type UsePagePollingOptions = {
  runOnMounted?: boolean;
  pauseWhenHidden?: boolean;
  refreshOnVisible?: boolean;
};

export const usePagePolling = (
  run: () => void,
  intervalMs: number,
  options: UsePagePollingOptions = {},
) => {
  const runOnMounted = options.runOnMounted ?? true;
  const pauseWhenHidden = options.pauseWhenHidden ?? true;
  const refreshOnVisible = options.refreshOnVisible ?? true;

  let timerId: number | null = null;

  const stop = () => {
    if (timerId === null) {
      return;
    }

    window.clearInterval(timerId);
    timerId = null;
  };

  const start = () => {
    if (timerId !== null || intervalMs <= 0) {
      return;
    }

    if (pauseWhenHidden && document.hidden) {
      return;
    }

    timerId = window.setInterval(() => {
      run();
    }, intervalMs);
  };

  const handleVisibilityChange = () => {
    if (!pauseWhenHidden) {
      return;
    }

    if (document.hidden) {
      stop();
      return;
    }

    if (refreshOnVisible) {
      run();
    }

    start();
  };

  onMounted(() => {
    if (runOnMounted) {
      run();
    }

    start();

    if (pauseWhenHidden) {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
  });

  onUnmounted(() => {
    if (pauseWhenHidden) {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    }

    stop();
  });

  return {
    start,
    stop,
  };
};
