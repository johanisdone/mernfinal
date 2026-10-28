import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, CalendarDays, Check, Clock3, IndianRupee, LoaderCircle, LockKeyhole, NotebookText, Pencil, RefreshCw, ShieldCheck } from 'lucide-react';
import { journalApi } from '../services/journalApi';
import { useJournal } from '../context/JournalContext';
import { StagePill, Trouble, Waiting, dayLabel } from '../components/Shared';
import RemoveApplication from '../components/RemoveApplication';

export default function ApplicationDetails() {
  const { id } = useParams();
  const { options, notify } = useJournal();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const cancel = new AbortController();
    setItem(null); setError(''); setActionError(''); setNextStatus('');
    journalApi(`/applications/${id}`, { signal: cancel.signal }).then(setItem).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => cancel.abort();
  }, [id, revision]);

  async function advance(event) {
    event.preventDefault();
    if (!item.nextStatuses.includes(nextStatus)) { setActionError('Choose one of the available next stages.'); return; }
    setSaving(true); setActionError('');
    try {
      const updated = await journalApi(`/applications/${id}/status`, { method: 'PATCH', payload: { status: nextStatus } });
      setItem(updated); setNextStatus(''); notify(`Moved to ${updated.status}. Your timeline is up to date.`);
    } catch (problem) { setActionError(problem.message); }
    finally { setSaving(false); }
  }
  const timestamp = instant => new Date(instant).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: options.timeZone });
  return <>
    <Link className="return-link" to="/"><ArrowLeft size={16} />Back to workspace</Link>
    {error ? <Trouble message={error} retry={() => setRevision(v => v + 1)} /> : !item ? <Waiting text="Opening this possibility…" /> : <>
      <div className="record-heading"><div><div className="record-reference"><span className="code-text">{item.applicationId}</span><StagePill stage={item.status} /></div><p className="record-company">{item.companyName}</p><h1>{item.jobRole}</h1></div><div className="record-actions"><Link className="action-button quiet" to={`/applications/${id}/edit`}><Pencil size={15} />Edit details</Link><RemoveApplication labelled item={item} onRemoved={() => navigate('/')} onError={setActionError} /></div></div>
      {actionError && <div className="problem-banner action-problem" role="alert"><span>{actionError}</span><button onClick={() => setRevision(v => v + 1)}><RefreshCw size={14} />Refresh record</button></div>}
      <div className="record-layout"><div className="record-main">
        <section className="record-paper"><div className="paper-title"><h2><BriefcaseBusiness size={18} />The details</h2><span className="read-only-note"><LockKeyhole size={12} />YOUR ORIGINAL RECORD</span></div><dl className="facts-grid"><div><dt>Company</dt><dd>{item.companyName}</dd></div><div><dt>Job type</dt><dd>{item.jobType}</dd></div><div><dt>Applied date</dt><dd><CalendarDays size={15} />{dayLabel(item.appliedDate, true)}</dd></div><div><dt>Expected salary</dt><dd><IndianRupee size={15} />{item.expectedSalary === null ? 'Not specified' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(item.expectedSalary)}</dd></div></dl><div className="identity-note"><LockKeyhole size={13} />The application number and applied date stay unchanged.</div></section>
        <section className="record-paper notes-paper"><div className="paper-title"><h2><NotebookText size={18} />A note to remember</h2><Link to={`/applications/${id}/edit`}>Edit notes<ArrowRight size={13} /></Link></div><p className={item.notes ? 'record-notes' : 'record-notes no-notes'}>{item.notes || 'No notes yet. Add a contact, a link, or an interview reminder when you have one.'}</p></section>
        <section className="record-paper history-paper"><div className="paper-title"><div><h2><Clock3 size={18} />The journey so far</h2><p>Every stage, with its moment in time.</p></div><span className="history-count">{item.statusHistory.length} {item.statusHistory.length === 1 ? 'event' : 'events'}</span></div><ol className="stage-timeline" aria-label="Status history">{item.statusHistory.map((event, index) => <li key={`${event.changedAt}-${index}`} className={index === item.statusHistory.length - 1 ? 'latest-event' : ''}><span className={`timeline-marker marker-${event.status.toLowerCase()}`}>{index === item.statusHistory.length - 1 ? <Clock3 size={15} /> : <Check size={15} />}</span><div><div className="timeline-heading"><strong>{event.status}</strong>{index === item.statusHistory.length - 1 && <span>Current stage</span>}</div><time dateTime={event.changedAt}>{timestamp(event.changedAt)}</time><p>{index === 0 ? 'Added to your application journal.' : `You moved this application to ${event.status}.`}</p></div></li>)}</ol><p className="timeline-calendar">Timestamps shown in {options.timeZone}.</p></section>
      </div><aside className="record-aside">
        <section className="stage-desk"><span className="aside-icon"><ArrowRight size={21} /></span><p className="overline">ONE STEP AT A TIME</p><h2>{item.nextStatuses.length ? 'What happened next?' : 'A chapter, complete.'}</h2><p>{item.nextStatuses.length ? 'Choose the next stage. We’ll save the change and its time to your timeline.' : `${item.status} is a final stage. Your timeline stays here as a record of this opportunity.`}</p>{item.nextStatuses.length ? <form onSubmit={advance}><label htmlFor="next-status">Next status</label><select id="next-status" value={nextStatus} onChange={e => setNextStatus(e.target.value)} disabled={saving}><option value="" disabled>Choose the next stage</option>{item.nextStatuses.map(stage => <option key={stage}>{stage}</option>)}</select><button className="action-button" disabled={saving || !nextStatus}>{saving ? <LoaderCircle className="turning" size={16} /> : <Check size={16} />}{saving ? 'Saving stage…' : 'Update status'}</button></form> : <div className="final-state"><ShieldCheck size={18} />Final status · no further changes</div>}</section>
        <section className={`followup-paper ${item.isOverdue ? 'is-late' : ''}`}><span className="followup-icon"><CalendarDays size={21} /></span><div><p className="overline">FOLLOW-UP DATE</p><h3>{dayLabel(item.followUpDate, true)}</h3><p>{item.status !== 'Applied' ? 'Kept on record from your original application.' : item.isOverdue ? 'A little nudge might be the next right move.' : 'Seven days after applying. We’ll flag it here if it becomes overdue.'}</p>{item.isOverdue && <span className="overdue-label"><span />Follow-up Overdue</span>}</div></section>
        {!item.canDelete && <div className="deletion-note"><LockKeyhole size={17} /><p>Deletion is paused during <strong>{item.status}</strong>. Move to a final stage before removing this application.</p></div>}
        <p className="record-updated">Last updated {timestamp(item.updatedAt)}</p>
      </aside></div>
    </>}
  </>;
}
