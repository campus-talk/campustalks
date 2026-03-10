import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { client } from "./lib/appwrite";

// Ping Appwrite backend to verify setup
client.ping().then(() => {
  console.log("✅ Appwrite connection successful");
}).catch((err: unknown) => {
  console.error("❌ Appwrite connection failed:", err);
});

createRoot(document.getElementById("root")!).render(<App />);
