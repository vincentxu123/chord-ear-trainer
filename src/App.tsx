import { Practice } from './pages/Practice';
import { PianoKeyboard } from './components/PianoKeyboard';
import { InstallApp } from './components/InstallApp';

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-slate-100">
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-7 text-center sm:mb-10">
          <h1 className="text-3xl font-bold">Chord Ear Trainer</h1>
          <div className="mt-3">
            <InstallApp />
          </div>
        </header>
        <Practice />
      </div>
      <PianoKeyboard />
    </div>
  );
}
