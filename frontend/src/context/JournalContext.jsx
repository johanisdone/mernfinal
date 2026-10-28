import { createContext, useContext, useEffect, useState } from 'react';
import { journalApi } from '../services/journalApi';

const JournalContext = createContext(null);

export function JournalProvider({ children }) {
  const [options, setOptions] = useState(null);
  const [bootError, setBootError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const cancellation = new AbortController();
    setBootError('');
    journalApi('/applications/options', { signal: cancellation.signal })
      .then(setOptions)
      .catch(error => { if (error.name !== 'AbortError') setBootError(error.message); });
    return () => cancellation.abort();
  }, [attempt]);
  useEffect(() => {
    if (!notice) return;
    const expiry = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(expiry);
  }, [notice]);
  return <JournalContext.Provider value={{ options, bootError, retryBoot: () => setAttempt(v => v + 1), notice, notify: setNotice }}>{children}</JournalContext.Provider>;
}

export const useJournal = () => useContext(JournalContext);
