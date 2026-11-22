import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from './components/ui/button';
import './styles.css';

const PublicPage = lazy(() => import('./public-page'));
const AdminPage = lazy(() => import('./admin-page'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense
        fallback={
          <div
            className="boot-loading atlas-coord-bg flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center"
            role="status"
          >
            <span className="mb-1 grid size-12 place-items-center rounded-2xl bg-[#161922] text-[#e59a3c] shadow-[var(--shadow-elevated)]">
              <Compass className="spin" size={24} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold tracking-[0.24em] text-foreground">
              TRACE ATLAS
            </span>
            <span className="text-sm text-muted-foreground">正在载入…</span>
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<PublicPage />} />
          <Route path="/admin/*" element={<AdminPage />} />
          <Route
            path="*"
            element={
              <main className="not-found atlas-coord-bg flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
                <span className="grid size-16 place-items-center rounded-2xl bg-[#161922] text-[#e59a3c] shadow-[var(--shadow-elevated)]">
                  <Compass size={32} strokeWidth={1.4} aria-hidden="true" />
                </span>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  这片区域尚未探索
                </h1>
                <Button asChild className="mt-1 rounded-full px-5">
                  <a href="/">回到地图</a>
                </Button>
              </main>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
