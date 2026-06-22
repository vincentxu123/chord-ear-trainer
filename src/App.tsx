import { Practice } from './pages/Practice';
import { PianoKeyboard } from './components/PianoKeyboard';

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-slate-100">
      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold">Chord Ear Trainer</h1>
          <p className="mt-2 text-slate-400">
            Play the progression, then identify each chord by its function.
          </p>
        </header>
        <Practice />
      </div>
      <PianoKeyboard />
    </div>
  );
}
