import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const App: React.FC = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">QueueFlow</h1>
        <p className="mt-2 text-slate-400">
          Intelligent Appointment & Real-Time Queue Management System
        </p>
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

export default App;
