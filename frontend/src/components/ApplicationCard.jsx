import { ArrowUpRight, CalendarDays, Clock3, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StagePill, dayLabel } from './Shared';
import RemoveApplication from './RemoveApplication';

export default function ApplicationCard({ item, onRemoved, onError }) {
  const monogram = item.companyName.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase();
  return <article className="application-card">
    <div className="card-topline"><span className={`company-monogram monogram-${item.companyName.length % 5}`}>{monogram}</span><StagePill stage={item.status} /></div>
    <div className="company-heading"><p>{item.companyName}</p><h3><Link to={`/applications/${item._id}`}>{item.jobRole}</Link></h3></div>
    <div className="card-tags"><span>{item.jobType}</span><span className="code-text">{item.applicationId}</span></div>
    <div className="card-dates"><span><CalendarDays size={14} />Applied {dayLabel(item.appliedDate)}</span><span><Clock3 size={14} />Follow up {dayLabel(item.followUpDate)}</span></div>
    {item.isOverdue && <div className="overdue-label"><span />Follow-up Overdue</div>}
    <div className="card-bottomline"><Link className="open-card" to={`/applications/${item._id}`}>View application<ArrowUpRight size={15} /></Link><div className="card-tools"><Link className="square-button" to={`/applications/${item._id}/edit`} aria-label={`Edit ${item.applicationId}`}><Pencil size={15} /></Link><RemoveApplication item={item} onRemoved={onRemoved} onError={onError} /></div></div>
  </article>;
}
