import { useEffect, useState } from "react";
import { listNotes, login, createNote } from "./api";

type Note = { id: string; title: string; updated_at: string };

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "" });

  useEffect(() => {
    if (authed) listNotes().then(setNotes).catch(() => setAuthed(false));
  }, [authed]);

  if (!authed) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await login(email, password);
          setAuthed(true);
        }}
      >
        <h1>Sign in</h1>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="password"
        />
        <button type="submit">Sign in</button>
      </form>
    );
  }

  return (
    <main>
      <h1>Your notes</h1>
      <ul>
        {notes.map((n) => (
          <li key={n.id}>{n.title}</li>
        ))}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await createNote(draft.title, draft.body);
          setNotes(await listNotes());
          setDraft({ title: "", body: "" });
        }}
      >
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Title"
        />
        <textarea
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          placeholder="Write a note..."
        />
        <button type="submit">Create</button>
      </form>
    </main>
  );
}
