import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import Preprocessing from './pages/Preprocessing';
import Classification from './pages/Classification';
import Segmentation from './pages/Segmentation';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Navbar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<Preprocessing />} />
              <Route path="/classify" element={<Classification />} />
              <Route path="/segment" element={<Segmentation />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}
