import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState("");

  async function loadTasks() {
    try {
      const health = await fetch(`${API_URL}/health`);
      const healthData = await health.json();
      setStatus(`Backend: ${healthData.status} | DB: ${healthData.database}`);

      const response = await fetch(`${API_URL}/api/tasks`);
      if (!response.ok) throw new Error("Failed to load tasks");
      setTasks(await response.json());
      setError("");
    } catch (err) {
      setError("Could not reach backend. Is Docker running?");
      setStatus("Backend unavailable");
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  async function addTask(event) {
    event.preventDefault();
    if (!title.trim()) return;

    const response = await fetch(`${API_URL}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (response.ok) {
      setTitle("");
      loadTasks();
    }
  }

  async function toggleTask(id, completed) {
    await fetch(`${API_URL}/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !completed }),
    });
    loadTasks();
  }

  return (
    <main>
      <h1>Docker Full Stack Practice</h1>
      <p className="subtitle">React + Express + PostgreSQL</p>

      <div className="card">
        <p className="status">{status}</p>
        {error && <p className="error">{error}</p>}

        <form onSubmit={addTask}>
          <input
            type="text"
            placeholder="Add a Docker learning task..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>

        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => toggleTask(task.id, task.completed)}
              />
              <span className={task.completed ? "done" : ""}>{task.title}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
