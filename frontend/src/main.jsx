import React from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import { BrowserRouter } from 'react-router-dom';
import { JournalProvider } from './context/JournalContext';
import App from './App';
import './styles/journal.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><JournalProvider><App /></JournalProvider></BrowserRouter></React.StrictMode>);
