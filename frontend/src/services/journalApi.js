const endpoint = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

export class JournalError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.fields = data?.errors || {};
  }
}

export async function journalApi(path, { method = 'GET', payload, signal } = {}) {
  let response;
  try {
    response = await fetch(endpoint + path, {
      method,
      signal,
      headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload)
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new JournalError('The journal is out of reach. Check your connection and try again.', 0);
  }
  const envelope = await response.json().catch(() => null);
  if (!response.ok || !envelope?.success) {
    throw new JournalError(envelope?.message || 'The server could not complete this request. Please try again.', response.status, envelope?.data);
  }
  return envelope.data;
}
