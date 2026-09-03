import { useStore } from './store';
import Header from './components/Header';
import FolderPicker from './components/FolderPicker';
import CategoryGrid from './components/CategoryGrid';
import AnalysisModal from './components/AnalysisModal';
import UndoModal from './components/UndoModal';
import SettingsModal from './components/SettingsModal';
import WatchPanel from './components/WatchPanel';
import DuplicatesPanel from './components/DuplicatesPanel';
import DiskPanel from './components/DiskPanel';
import CleanupPanel from './components/CleanupPanel';
import OperationPanel from './components/OperationPanel';
import Toasts from './components/Toasts';
import './App.css';

export default function App() {
  const store = useStore();

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
      <Header store={store} />
      <main className="app-main">
        <FolderPicker store={store} />
        {busy ? <OperationPanel /> : <CategoryGrid store={store} />}
      </main>
      {!store.desktop && (
        <footer className="dev-note">
          Browser preview — sorting runs against sample data; for real
          folders run the desktop runtime (python main_web.py).
        </footer>
      )}
      <AnalysisModal />
      <UndoModal />
      {store.settingsOpen && <SettingsModal />}
      <WatchPanel store={store} />
      <DuplicatesPanel store={store} />
      <DiskPanel store={store} />
      <CleanupPanel store={store} />
      <Toasts />
    </div>
  );
}
