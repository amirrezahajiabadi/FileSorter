import { useStore } from './store';
import Header from './components/Header';
import FolderPicker from './components/FolderPicker';
import CategoryGrid from './components/CategoryGrid';
import './App.css';

export default function App() {
  const store = useStore();

  if (!store.ready) {
    return (
      <div className="boot-screen">
        <span className="boot-spinner" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div id="app">
      <Header store={store} />
      <main className="app-main">
        <FolderPicker store={store} />
        <CategoryGrid store={store} />
      </main>
      {!store.desktop && (
        <footer className="dev-note">
          Browser preview — folder picking and sorting need the desktop
          runtime (python main_web.py).
        </footer>
      )}
    </div>
  );
}
