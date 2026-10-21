import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./widget.css";
import "./themes.css";
import "./display.css";
import "./interaction.css";
import "./privacy-question.css";
import "./collection.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
