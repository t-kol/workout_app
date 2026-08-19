import { supabase } from './supabaseclient.js';

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('Logout error:', error);
  window.location.href = 'index.html';
}

export async function checkAuthRedirect() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session && window.location.pathname.endsWith('index.html')) {
    window.location.href = 'app.html';
  } else if (!session && window.location.pathname.endsWith('app.html')) {
    window.location.href = 'index.html';
  }
  return session;
}