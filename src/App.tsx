import { Practice } from './pages/Practice';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold">Chord Ear Trainer</h1>
          <p className="mt-2 text-slate-400">
            Play the progression, then identify each chord by its function.
          </p>
        </header>
        <Practice />
      </div>
    </div>
  );
}
