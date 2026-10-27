import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import TopBar from "./components/TopBar.jsx";
import Toasts from "./components/Toasts.jsx";
import PresenterPanel from "./components/PresenterPanel.jsx";
import { useStore } from "./context/Store.jsx";
import Home from "./pages/Home.jsx";
import Concerts from "./pages/Concerts.jsx";
import MyTickets from "./pages/MyTickets.jsx";
import Gate from "./pages/Gate.jsx";
import Organizer from "./pages/Organizer.jsx";
import Blockchain from "./pages/Blockchain.jsx";
import FraudLab from "./pages/FraudLab.jsx";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const { presenterOpen } = useStore();
  return (
    <div className={`app ${presenterOpen ? "with-presenter" : ""}`}>
      <ScrollToTop />
      <TopBar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/concerts" element={<Concerts />} />
          <Route path="/tickets" element={<MyTickets />} />
          <Route path="/gate" element={<Gate />} />
          <Route path="/organizer" element={<Organizer />} />
          <Route path="/blockchain" element={<Blockchain />} />
          <Route path="/fraud" element={<FraudLab />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <footer className="footer">
        PIXELPASS / a blockchain running inside your browser / SHA-256 fingerprints and real digital signatures
      </footer>
      <PresenterPanel />
      <Toasts />
    </div>
  );
}
