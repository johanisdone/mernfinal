import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BriefcaseBusiness, ChevronLeft, ChevronRight, CircleX, Clock3, Handshake, MessageCircle, Plus, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { journalApi } from '../services/journalApi';
import { useJournal } from '../context/JournalContext';
import { BlankJournal, Trouble, Waiting } from '../components/Shared';
import ApplicationCard from '../components/ApplicationCard';

const symbols = { Applied: BriefcaseBusiness, Interview: MessageCircle, Offer: Sparkles, Rejected: CircleX, Accepted: Handshake, Declined: ArrowRight };

export default function Workspace() {
  const { options } = useJournal();
  const [parameters, setParameters] = useSearchParams();
  const [company, setCompany] = useState(parameters.get('company') || '');
  const [journal, setJournal] = useState(null);
  const [problem, setProblem] = useState('');
  const [actionProblem, setActionProblem] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const query = parameters.toString();
  const appliedCompany = parameters.get('company') || '';
  const status = parameters.get('status') || '';
  useEffect(() => { setCompany(appliedCompany); }, [appliedCompany]);
  useEffect(() => {
    const cancel = new AbortController();
    setLoading(true); setProblem('');
    Promise.all([
      journalApi('/applications/stats', { signal: cancel.signal }),
      journalApi(`/applications?${query}`, { signal: cancel.signal })
    ]).then(([totals, list]) => setJournal({ ...list, totals }))
      .catch(error => { if (error.name !== 'AbortError') setProblem(error.message); })
      .finally(() => { if (!cancel.signal.aborted) setLoading(false); });
    return () => cancel.abort();
  }, [query, revision]);

  function filter(key, value) {
    setParameters(current => {
      const next = new URLSearchParams(current);
      next.delete('page');
      if (value) next.set(key, value); else next.delete(key);
      return next;
    });
  }
  const refresh = () => { setActionProblem(''); setRevision(value => value + 1); };
  const total = journal?.totals.total || 0;
  const active = journal ? journal.totals.counts.Applied + journal.totals.counts.Interview + journal.totals.counts.Offer : 0;
  const page = journal?.pagination.page || 1;
  const filtered = Boolean(appliedCompany || status);
  return <>
    <section className="workspace-intro"><div><p className="overline"><span />YOUR APPLICATION JOURNAL</p><h1>Small steps.<br /><em>Bigger possibilities.</em></h1><p>Keep your applications in view and your next move in focus.</p></div><div className="intro-side"><span className="intro-flourish" aria-hidden="true">↗</span><Link to="/applications/new" className="action-button"><Plus size={18} />Add application</Link><span>No missed details. No lost opportunities.</span></div></section>
    <section className="status-overview" aria-label="Application counts by status">{options.statuses.map(stage => {
      const Icon = symbols[stage];
      return <button className={`status-tile tone-${stage.toLowerCase()} ${status === stage ? 'chosen' : ''}`} key={stage} onClick={() => filter('status', status === stage ? '' : stage)} aria-pressed={status === stage}><span className="tile-top"><span>{stage}</span><span className="tile-symbol"><Icon size={17} /></span></span><strong>{journal ? journal.totals.counts[stage] : '—'}</strong><span className="tile-foot">{stage === 'Applied' ? 'The journey begins' : stage === 'Interview' ? 'Conversations in motion' : stage === 'Offer' ? 'Something to consider' : stage === 'Accepted' ? 'A new chapter ahead' : stage === 'Rejected' ? 'A different direction' : 'Your choice, your path'}<ArrowUpRight size={13} /></span></button>;
    })}</section>

    <section className="journal-summary" aria-label="Pipeline summary"><div className="summary-heading"><span className="summary-icon"><BriefcaseBusiness size={17} /></span><p><strong>{total}</strong> total applications<span className="summary-divider">/</span><strong>{active}</strong> in your active pipeline</p></div><div className="summary-trail" aria-label="Status distribution">{options.statuses.map(stage => journal?.totals.counts[stage] ? <span key={stage} className={`trail-${stage.toLowerCase()}`} style={{ flex: journal.totals.counts[stage] }} title={`${stage}: ${journal.totals.counts[stage]}`} /> : null)}</div><div className={journal?.totals.overdue ? 'summary-due needs-followup' : 'summary-due'}><Clock3 size={15} />{journal?.totals.overdue ? `${journal.totals.overdue} follow-up${journal.totals.overdue === 1 ? '' : 's'} overdue` : 'Follow-ups, kept in sight'}</div></section>

    <section className="journal-list"><div className="list-title"><div><h2>Your applications<span>{total}</span></h2><p>Every possibility, in one place.</p></div><span className="list-hint"><span className="tiny-live-dot" />BACKED BY YOUR DATABASE</span></div>
      <div className="filter-bar"><form className="company-search" onSubmit={event => { event.preventDefault(); filter('company', company.trim()); }}><Search size={18} /><label className="visually-hidden" htmlFor="company-search">Search by company</label><input id="company-search" value={company} onChange={e => setCompany(e.target.value)} maxLength={120} placeholder="Find a company…" /><button type="submit" aria-label="Search applications"><ArrowRight size={17} /></button></form><div className="status-filter"><SlidersHorizontal size={16} /><label htmlFor="status-filter" className="visually-hidden">Filter by status</label><select id="status-filter" value={status} onChange={e => filter('status', e.target.value)}><option value="">All statuses</option>{options.statuses.map(stage => <option key={stage}>{stage}</option>)}</select></div>{filtered && <button className="clear-filters" onClick={() => { setCompany(''); setParameters({}); }}><X size={14} />Clear filters</button>}</div>
      {actionProblem && <div className="problem-banner" role="alert">{actionProblem}</div>}
      {loading ? <Waiting text="Gathering your applications…" /> : problem ? <Trouble message={problem} retry={refresh} /> : !journal.items.length ? <BlankJournal filtered={filtered} /> : <>
        <div className="application-grid">{journal.items.map(item => <ApplicationCard key={item._id} item={item} onRemoved={refresh} onError={setActionProblem} />)}</div>
        <div className="journal-pagination"><span>Showing {(page - 1) * journal.pagination.limit + 1}–{Math.min(page * journal.pagination.limit, journal.pagination.total)} of {journal.pagination.total} applications</span><div><button className="square-button" aria-label="Previous page" disabled={page === 1} onClick={() => setParameters(old => { const next = new URLSearchParams(old); next.set('page', String(page - 1)); return next; })}><ChevronLeft size={17} /></button><span>{page} / {journal.pagination.pages}</span><button className="square-button" aria-label="Next page" disabled={page >= journal.pagination.pages} onClick={() => setParameters(old => { const next = new URLSearchParams(old); next.set('page', String(page + 1)); return next; })}><ChevronRight size={17} /></button></div></div>
      </>}
    </section>
  </>;
}
