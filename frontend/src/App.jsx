import { Navigate, Route, Routes } from 'react-router-dom';
import { useJournal } from './context/JournalContext';
import Frame, { Wordmark } from './components/Frame';
import { Trouble, Waiting } from './components/Shared';
import Workspace from './pages/Workspace';
import ApplicationForm from './pages/ApplicationForm';
import ApplicationDetails from './pages/ApplicationDetails';

export default function App() {
  const { options, bootError, retryBoot } = useJournal();
  if (!options) return <div className="opening-screen"><Wordmark />{bootError ? <Trouble message={bootError} retry={retryBoot} /> : <Waiting />}</div>;
  return <Routes><Route element={<Frame />}><Route index element={<Workspace />} /><Route path="applications/new" element={<ApplicationForm key="create" />} /><Route path="applications/:id" element={<ApplicationDetails />} /><Route path="applications/:id/edit" element={<ApplicationForm key="edit" />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Routes>;
}
