import { useStoreFields } from './store';
import Header from './components/Header';
import FolderPicker from './components/FolderPicker';
import CategoryGrid from './components/CategoryGrid';
import AnalysisModal from './components/AnalysisModal';
import OperationPanel from './components/OperationPanel';
import UndoModal from './components/UndoModal';
import SettingsModal from './components/SettingsModal';
import WatchPanel from './components/WatchPanel';
import DuplicatesPanel from './components/DuplicatesPanel';
import DiskPanel from './components/DiskPanel';
import CleanupPanel from './components/CleanupPanel';
import SchedulesPanel from './components/SchedulesPanel';
import Toasts from './components/Toasts';
import { t } from './i18n';
import './App.css';

export default function App() {
  // App itself subscribes to three small fields only. Every panel owns its
  // own subscription now, so a per-file progress tick no longer walks the
  // whole tree (the panels are always mounted).
  const store = useStoreFields([
    'ready',
    'phase',
    'transport',
    'strings',
    'settingsOpen',
  ]);

  if (!store.ready) {
    return (
      <div className="boot-screen">
        <span className="spinner" aria-hidden="true" />
      </div>
    );
  }

  const busy = store.phase === 'sorting' || store.phase === 'done';

  return (
    <div id="app">
      <Header />
      <main className="app-main">
        <FolderPicker />
        {busy ? <OperationPanel /> : <CategoryGrid />}
      </main>
      {store.transport === 'service' && (
        <footer className="dev-note">
          {t(store.strings, 'service_note')}
        </footer>
      )}
      {store.transport === 'mock' && (
        <footer className="dev-note">
          Browser preview — sorting runs against sample data; for real
          folders run the desktop runtime (python main_web.py).
        </footer>
      )}
      <AnalysisModal />
      <UndoModal />
      {store.settingsOpen && <SettingsModal />}
      <WatchPanel />
      <DuplicatesPanel />
      <DiskPanel />
      <CleanupPanel />
      <SchedulesPanel />
      <Toasts />
    </div>
  );
}
