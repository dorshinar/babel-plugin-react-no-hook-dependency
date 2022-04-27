import "./App.css";
import { useEffect, useState } from "react";

function App() {
  const [clicked, setClicked] = useState(0);

  useEffect(() => {
    console.log(clicked);
  });

  return (
    <div className="App">
      <header className="App-header">
        <p>Press the button to set clicked: {clicked}</p>
        <button onClick={() => setClicked((prev) => prev + 1)}>
          Increment
        </button>
      </header>
    </div>
  );
}

export default App;
