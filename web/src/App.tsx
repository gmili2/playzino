import { Link, Route, Routes } from 'react-router-dom';
import { Page, RequireAuth } from './components/AppShell';
import { AdminPage } from './pages/Admin';
import { LoginPage, RegisterPage } from './pages/Auth';
import { GamePage } from './pages/Game';
import { HomePage } from './pages/Home';
import { LandingPage } from './pages/Landing';
import { useAuth } from './lib/auth';
import { Loading } from './components/ui';
import { ProfilePage } from './pages/Profile';
import { RulesPage } from './pages/Rules';
import { TablesPage } from './pages/Tables';

/** Visiteurs : page d'accueil vitrine ; joueurs connectés : tableau de bord avec les tables. */
function Root() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? <HomePage /> : <LandingPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Root />} />
      <Route path="/tables" element={<TablesPage />} />
      <Route path="/rules" element={<RulesPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="/room/:roomId" element={<RequireAuth><GamePage /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
      <Route path="*" element={<Page><h1>الصفحة غير موجودة</h1><Link to="/">العودة للرئيسية</Link></Page>} />
    </Routes>
  );
}
