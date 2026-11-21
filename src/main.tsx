import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './styles.css';
const PublicPage = lazy(() => import('./public-page'));
const AdminPage = lazy(() => import('./admin-page'));
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="boot-loading">
            TRACE ATLAS<span>正在载入…</span>
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<PublicPage />} />
          <Route path="/admin/*" element={<AdminPage />} />
          <Route
            path="*"
            element={
              <main className="not-found">
                <h1>这片区域尚未探索</h1>
                <a href="/">回到地图</a>
              </main>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
