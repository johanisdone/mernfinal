import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, Check, Hash, Info, LoaderCircle, LockKeyhole, NotebookPen, Sparkles } from 'lucide-react';
import { useJournal } from '../context/JournalContext';
import { journalApi } from '../services/journalApi';
import { FieldGroup, PageTitle, Trouble, Waiting } from '../components/Shared';

export default function ApplicationForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { options, notify } = useJournal();
  const navigate = useNavigate();
  const [values, setValues] = useState({ companyName: '', jobRole: '', jobType: 'Full-time', appliedDate: options.today, expectedSalary: '', notes: '' });
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const errorRegion = useRef(null);

  useEffect(() => {
    if (!editing) return;
    const cancel = new AbortController();
    setLoading(true); setLoadError('');
    journalApi(`/applications/${id}`, { signal: cancel.signal }).then(item => {
      setRecord(item);
      setValues({ companyName: item.companyName, jobRole: item.jobRole, jobType: item.jobType, appliedDate: item.appliedDate, expectedSalary: item.expectedSalary ?? '', notes: item.notes });
    }).catch(err => { if (err.name !== 'AbortError') setLoadError(err.message); }).finally(() => { if (!cancel.signal.aborted) setLoading(false); });
    return () => cancel.abort();
  }, [id, editing, attempt]);

  function update(e) { setValues(previous => ({ ...previous, [e.target.name]: e.target.value })); }
  const props = name => ({ id: name, name, value: values[name], onChange: update, 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `${name}-error` : undefined });
  async function submit(e) {
    e.preventDefault(); setError('');
    const issues = {};
    if ((values.companyName.match(/[a-z]/gi) || []).length < 3) issues.companyName = 'Add a company name containing at least three letters.';
    if (!values.jobRole.trim()) issues.jobRole = 'Tell us which role you applied for.';
    if (!options.jobTypes.includes(values.jobType)) issues.jobType = 'Choose a job type.';
    if (!editing && (!values.appliedDate || values.appliedDate > options.today || values.appliedDate < '1900-01-01')) issues.appliedDate = 'Choose a valid date that is not in the future.';
    if (values.expectedSalary !== '' && (!Number.isFinite(Number(values.expectedSalary)) || Number(values.expectedSalary) < 0 || !/^\d+(\.\d{1,2})?$/.test(String(values.expectedSalary)))) issues.expectedSalary = 'Enter a non-negative salary with at most two decimal places, or leave it blank.';
    setErrors(issues);
    if (Object.keys(issues).length) { document.getElementById(Object.keys(issues)[0])?.focus(); return; }
    setSaving(true);
    const payload = { companyName: values.companyName.trim(), jobRole: values.jobRole.trim(), jobType: values.jobType, expectedSalary: values.expectedSalary === '' ? null : Number(values.expectedSalary), notes: values.notes.trim(), ...(!editing ? { appliedDate: values.appliedDate } : {}) };
    try {
      const item = await journalApi(editing ? `/applications/${id}` : '/applications', { method: editing ? 'PATCH' : 'POST', payload });
      notify(editing ? `${item.applicationId} updated. You’re all caught up.` : `${item.applicationId} added. Here’s to the next step.`);
      navigate(`/applications/${item._id}`);
    } catch (err) { setError(err.message); setErrors(err.fields || {}); setTimeout(() => errorRegion.current?.focus(), 0); }
    finally { setSaving(false); }
  }

  return <>
    <Link to={editing ? `/applications/${id}` : '/'} className="return-link"><ArrowLeft size={16} />Back to {editing ? 'application' : 'workspace'}</Link>
    <PageTitle label={editing ? 'KEEP YOUR DETAILS CURRENT' : 'MAKE ROOM FOR POSSIBILITY'} title={editing ? 'A little update.' : 'One more possibility.'} description={editing ? 'Refine the details. Your application number and applied date stay the same.' : 'Capture the details now. Let the next step take care of itself.'} />
    {loading ? <Waiting text="Finding the original details…" /> : loadError ? <Trouble message={loadError} retry={() => setAttempt(v => v + 1)} /> : <div className="entry-layout">
      <form className="entry-paper" noValidate onSubmit={submit}>
        <div className="entry-heading"><span><NotebookPen size={21} /></span><div><h2>{editing ? 'Application details' : 'The opportunity'}</h2><p>Fields marked * are required. The rest is up to you.</p></div></div>
        {error && <div className="problem-banner" ref={errorRegion} tabIndex={-1} role="alert">{error}</div>}
        <div className="form-two-columns"><FieldGroup name="companyName" title="Company name *" error={errors.companyName}><input {...props('companyName')} maxLength={120} autoComplete="organization" placeholder="e.g. Infosys" /></FieldGroup><FieldGroup name="jobRole" title="Job role *" error={errors.jobRole}><input {...props('jobRole')} maxLength={120} placeholder="e.g. Frontend Developer" /></FieldGroup></div>
        <div className="form-two-columns"><FieldGroup name="jobType" title="Job type *" error={errors.jobType}><select {...props('jobType')}>{options.jobTypes.map(type => <option key={type}>{type}</option>)}</select></FieldGroup><FieldGroup name="appliedDate" title="Applied date *" error={errors.appliedDate} hint={editing ? 'The original applied date cannot be changed.' : `Today or earlier. Calendar: ${options.timeZone}.`}><input {...props('appliedDate')} type="date" min="1900-01-01" max={options.today} disabled={editing} /></FieldGroup></div>
        <FieldGroup name="expectedSalary" title="Expected salary (optional)" error={errors.expectedSalary} hint="Enter an amount in INR, or leave this open for now."><div className="salary-input"><span aria-hidden="true">₹</span><input {...props('expectedSalary')} type="number" min="0" max="1000000000000" step="0.01" placeholder="e.g. 600000" /></div></FieldGroup>
        <FieldGroup name="notes" title="Notes (optional)" error={errors.notes}><textarea {...props('notes')} rows={5} maxLength={3000} placeholder="A contact name, the job listing link, or something you want to remember…" /><div className="word-counter">{values.notes.length} / 3,000</div></FieldGroup>
        <div className="entry-actions"><Link className="action-button quiet" to={editing ? `/applications/${id}` : '/'}>Cancel</Link><button className="action-button" disabled={saving}>{saving ? <LoaderCircle className="turning" size={17} /> : <Check size={17} />}{saving ? 'Saving…' : editing ? 'Save changes' : 'Save application'}<ArrowRight size={16} /></button></div>
      </form>
      <aside className="entry-aside"><section className="number-note"><span className="aside-icon"><Hash size={21} /></span><p className="overline">YOUR APPLICATION NUMBER</p><h3>{editing ? record.applicationId : 'A number of its own.'}</h3><p>{editing ? 'Issued once. Kept for the whole journey, even if the company or role changes.' : 'We’ll generate a unique company-based number when you save. No need to keep count.'}</p><span className="example-code">{editing ? <><LockKeyhole size={13} />Identity stays unchanged</> : 'JA-COM-001'}</span></section><section className="next-note"><p className="overline">A FEW THINGS, HANDLED.</p><div><CalendarDays size={17} /><p>A follow-up date is set <strong>7 days after you apply.</strong></p></div><div><Sparkles size={17} /><p>Every new opportunity starts at <strong>Applied.</strong></p></div><div><Info size={17} /><p>Already tracking an active company and role? We’ll let you know before creating a duplicate.</p></div></section></aside>
    </div>}
  </>;
}
