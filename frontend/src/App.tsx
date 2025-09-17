import Chat from './components/Chat';
import './style.css'; // Changed from './styles.css' to './style.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Berkshire Hathaway Intelligence</h1>
        <p>Ask questions about Warren Buffett's investment philosophy</p>
      </header>
      <main className="app-main">
        <Chat />
      </main>
    </div>
  );
}

export default App;