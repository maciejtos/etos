import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Schedule from './pages/Schedule';
import MyShifts from './pages/MyShifts';
import Exchange from './pages/Exchange';
import Profile from './pages/Profile';
import Team from './pages/Team';
import Chat from './pages/Chat';
import Availabilities from './pages/Availabilities';
import NotificationHandler from './components/NotificationHandler';

function PrivateRoute({ children }) {
  const { currentUser } = useAuth();
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  return (
    <>
      <NotificationHandler />
      {children}
    </>
  );
}

import { ChatProvider } from './contexts/ChatContext';

function App() {
  return (
    <AuthProvider>
      <ChatProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }>
              <Route index element={<Schedule />} />
              <Route path="my-shifts" element={<MyShifts />} />
              <Route path="exchange" element={<Exchange />} />
              <Route path="team" element={<Team />} />
              <Route path="profile" element={<Profile />} />
              <Route path="chat" element={<Chat />} />
              <Route path="availabilities" element={<Availabilities />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ChatProvider>
    </AuthProvider>
  );
}

export default App;
