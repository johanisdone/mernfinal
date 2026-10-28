import { useState } from 'react';
import { LoaderCircle, Trash2 } from 'lucide-react';
import { journalApi } from '../services/journalApi';
import { useJournal } from '../context/JournalContext';

export default function RemoveApplication({ item, onRemoved, onError, labelled = false }) {
  const [removing, setRemoving] = useState(false);
  const { notify } = useJournal();
  const allowed = item.canDelete;
  async function remove() {
    if (!window.confirm(`Delete ${item.applicationId} at ${item.companyName}? This cannot be undone.`)) return;
    setRemoving(true);
    try {
      await journalApi(`/applications/${item._id}`, { method: 'DELETE' });
      notify(`${item.applicationId} removed from your journal.`);
      onRemoved();
    } catch (error) { onError(error.message); }
    finally { setRemoving(false); }
  }
  const title = allowed ? `Delete ${item.applicationId}` : `Cannot delete while ${item.status}.`;
  return <button type="button" className={labelled ? 'action-button delete-action' : 'square-button remove-button'} title={title} aria-label={`Delete ${item.applicationId}`} disabled={!allowed || removing} onClick={remove}>{removing ? <LoaderCircle className="turning" size={16} /> : <Trash2 size={16} />}{labelled && 'Delete'}</button>;
}
