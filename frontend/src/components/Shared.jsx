import { AlertTriangle, ArrowUpRight, Inbox, LoaderCircle, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

export const stageToken = stage => stage.toLowerCase();

export function StagePill({ stage }) {
  return <span className={`stage-pill tone-${stageToken(stage)}`}><span aria-hidden="true" />{stage}</span>;
}

export function Waiting({ text = 'Opening your journal…' }) {
  return <div className="feedback-block" role="status"><LoaderCircle className="turning" size={28} /><p>{text}</p></div>;
}

export function Trouble({ message, retry }) {
  return <section className="feedback-block" role="alert"><span className="feedback-symbol warning"><AlertTriangle size={25} /></span><h2>A small detour.</h2><p>{message}</p>{retry && <button className="action-button quiet" onClick={retry}><RefreshCw size={16} />Try again</button>}</section>;
}

export function BlankJournal({ filtered = false }) {
  return <section className="feedback-block"><span className="feedback-symbol"><Inbox size={29} /></span><h2>{filtered ? 'No matches this time.' : 'Your next chapter starts here.'}</h2><p>{filtered ? 'Try another company or status, or clear the filters to see your journal.' : 'Add your first application. We’ll keep the details, deadlines, and next steps together.'}</p>{!filtered && <Link className="action-button" to="/applications/new">Add an application<ArrowUpRight size={17} /></Link>}</section>;
}

export function PageTitle({ label, title, description, children }) {
  return <div className="page-title"><div><p className="overline">{label}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{children}</div>;
}

export function dayLabel(iso, long = false) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(long ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}

export function FieldGroup({ name, title, error, hint, children }) {
  return <div className="field-group"><label htmlFor={name}>{title}</label>{children}{hint && <small id={`${name}-hint`}>{hint}</small>}{error && <p className="input-problem" id={`${name}-error`} role="alert">{error}</p>}</div>;
}
