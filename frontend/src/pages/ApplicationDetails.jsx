import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { journalApi } from '../services/journalApi';
import { PageTitle, StagePill, Trouble, Waiting } from '../components/Shared';

export default function ApplicationDetails() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const cancel = new AbortController();
    journalApi(`/applications/${id}`, { signal: cancel.signal }).then(setItem).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => cancel.abort();
  }, [id]);
  return <><Link className="return-link" to="/"><ArrowLeft size={16} />Back to workspace</Link>{error ? <Trouble message={error} /> : !item ? <Waiting /> : <><PageTitle label={item.applicationId} title={item.jobRole} description={item.companyName}><StagePill stage={item.status} /></PageTitle><section className="entry-paper"><h2>Application saved</h2><p>Your details are safely stored. You can return to your workspace or edit the information.</p><Link className="action-button quiet" to={`/applications/${id}/edit`}>Edit details</Link></section></>}</>;
}
