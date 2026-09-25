import { useCallback, useEffect, useRef, useState } from "react";

// One poller survives modal changes. A page reload discovers work from the server.
export function useRecognition(api, onJobs) {
  const [jobs, setJobs] = useState([]);
  const [issues, setIssues] = useState([]);
  const [error, setError] = useState("");
  const callback = useRef(onJobs),
    sequence = useRef(0),
    mounted = useRef(true);
  callback.current = onJobs;
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const result = await api("/jobs");
      if (!mounted.current || request !== sequence.current) return;
      setJobs(result.jobs);
      setIssues(result.issues);
      setError("");
      callback.current(result.jobs);
    } catch (e) {
      if (mounted.current && request === sequence.current) setError(e.message);
    }
  }, [api]);
  useEffect(() => {
    mounted.current = true;
    let timer;
    const poll = async () => {
      await refresh();
      if (mounted.current) timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  return { jobs, issues, error, refresh };
}
